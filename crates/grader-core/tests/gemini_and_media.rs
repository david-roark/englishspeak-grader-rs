use std::path::Path;
use std::time::Duration;

use grader_core::gemini::{
    filter_and_sort_models, is_gradable_model, rank_model, validate_api_key, GeminiClient,
    MediaResolution, UploadCache, UploadedFile, FALLBACK_MODELS,
};
use grader_core::media::{
    build_compress_video_args, build_extract_mp3_args, build_mute_video_args_to,
    build_trim_media_args_to, compress_video, extract_mp3, parse_duration_from_stderr,
    resolve_ffmpeg, DEFAULT_MP3_PRESET, DEFAULT_VIDEO_PRESET,
};
use grader_core::prompts::PromptProfile;
use grader_core::rubrics::get_builtin_rubric;
use grader_core::schemas::{AssessmentResult, CriterionScore, StudentAssessment};
use serde_json::json;
use tempfile::TempDir;
use wiremock::matchers::{header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[test]
fn test_model_filtering_and_ranking() {
    assert!(is_gradable_model("gemini-flash-latest"));
    assert!(is_gradable_model("gemini-2.5-pro"));
    assert!(is_gradable_model("models/gemini-2.5-flash"));
    assert!(is_gradable_model("gemini-flash-lite-latest"));

    assert!(!is_gradable_model("gemini-2.5-flash-tts"));
    assert!(!is_gradable_model("gemini-live-2.5-flash"));
    assert!(!is_gradable_model("gemini-2.0-flash-image"));
    assert!(!is_gradable_model("text-embedding-004"));
    assert!(!is_gradable_model("gemma-2-9b"));
    assert!(!is_gradable_model("veo-2"));
    assert!(!is_gradable_model("gemini-robotics-er"));
    assert!(!is_gradable_model("gemini-2.0-flash-nano-banana"));
    assert!(!is_gradable_model("gemini-1.0-ultra"));

    let mut ids = vec![
        "gemini-2.5-pro".to_string(),
        "gemini-flash-latest".to_string(),
        "gemini-flash-lite-latest".to_string(),
    ];
    ids.sort_by_key(|m| rank_model(m));
    assert_eq!(
        ids,
        vec![
            "gemini-flash-lite-latest",
            "gemini-flash-latest",
            "gemini-2.5-pro"
        ]
    );

    let filtered = filter_and_sort_models(vec![
        "models/gemini-2.5-pro".into(),
        "models/gemini-flash-lite-latest".into(),
        "models/gemini-2.5-flash-tts".into(),
    ]);
    assert_eq!(filtered, vec!["gemini-flash-lite-latest", "gemini-2.5-pro"]);
}

#[test]
fn test_validate_api_key_guards() {
    assert!(validate_api_key("").is_err());
    assert!(validate_api_key("   ").is_err());
    assert_eq!(validate_api_key("  AIzaValid ").unwrap(), "AIzaValid");
}

#[tokio::test]
async fn test_list_models_mock_and_fallback() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1beta/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "models": [
                {"name": "models/gemini-2.5-pro", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/gemini-flash-lite-latest", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/gemini-2.5-flash-tts", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]}
            ]
        })))
        .mount(&server)
        .await;

    let client = GeminiClient::with_base_url("test-key", server.uri()).unwrap();
    let models = client.list_models().await;
    assert_eq!(models, vec!["gemini-flash-lite-latest", "gemini-2.5-pro"]);

    // Error -> fallback
    let down_client = GeminiClient::with_base_url("test-key", "http://127.0.0.1:9").unwrap();
    let fallback = down_client.list_models().await;
    assert_eq!(
        fallback,
        FALLBACK_MODELS
            .iter()
            .map(|s| (*s).to_string())
            .collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn test_upload_video_resumable_and_cache_flow() {
    let server = MockServer::start().await;
    let dir = TempDir::new().unwrap();
    let video_a = dir.path().join("a.mp4");
    let video_b = dir.path().join("b.mp4");
    tokio::fs::write(&video_a, b"fake video A bytes")
        .await
        .unwrap();
    tokio::fs::write(&video_b, b"fake video B bytes")
        .await
        .unwrap();

    let upload_session_url = format!("{}/upload-session/1", server.uri());

    // 1. Start resumable upload
    Mock::given(method("POST"))
        .and(path("/upload/v1beta/files"))
        .and(header("X-Goog-Upload-Command", "start"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("X-Goog-Upload-URL", upload_session_url.as_str()),
        )
        .mount(&server)
        .await;

    // 2. Upload bytes -> returns PROCESSING
    Mock::given(method("POST"))
        .and(path("/upload-session/1"))
        .and(wiremock::matchers::header_exists("X-Goog-Upload-Command"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "file": {
                "name": "files/vid123",
                "uri": "https://generativelanguage.googleapis.com/v1beta/files/vid123",
                "mimeType": "video/mp4",
                "state": "PROCESSING"
            }
        })))
        .mount(&server)
        .await;

    // 3. Poll GET -> ACTIVE
    Mock::given(method("GET"))
        .and(path("/v1beta/files/vid123"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "name": "files/vid123",
            "uri": "https://generativelanguage.googleapis.com/v1beta/files/vid123",
            "mimeType": "video/mp4",
            "state": "ACTIVE"
        })))
        .mount(&server)
        .await;

    // 4. Delete old file when switching to video_b
    Mock::given(method("DELETE"))
        .and(path("/v1beta/files/vid123"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    let client = GeminiClient::with_base_url("test-key", server.uri()).unwrap();
    let cache = UploadCache::new();

    // First call: uploads video_a
    let (up1, hit1) = client
        .get_or_upload(
            &video_a,
            &cache,
            Duration::from_millis(10),
            Duration::from_secs(5),
            |_| {},
            None,
        )
        .await
        .unwrap();
    assert!(!hit1);
    assert_eq!(up1.name, "files/vid123");

    // Second call same file: cache hit!
    let (_up2, hit2) = client
        .get_or_upload(
            &video_a,
            &cache,
            Duration::from_millis(10),
            Duration::from_secs(5),
            |_| {},
            None,
        )
        .await
        .unwrap();
    assert!(hit2);

    // Third call different file: cleans up old file and uploads new
    let (_up3, hit3) = client
        .get_or_upload(
            &video_b,
            &cache,
            Duration::from_millis(10),
            Duration::from_secs(5),
            |_| {},
            None,
        )
        .await
        .unwrap();
    assert!(!hit3);
}

#[tokio::test]
async fn test_grade_video_success_and_errors() {
    let server = MockServer::start().await;
    let valid = AssessmentResult {
        task_summary: "Short talk".into(),
        detected_language: "English".into(),
        general_notes: String::new(),
        students: vec![StudentAssessment {
            student_name: "An".into(),
            name_confident: true,
            criteria: vec![CriterionScore {
                criterion: "Fluency and Coherence".into(),
                score: 7.0,
                max_score: 9.0,
                comment: "Good".into(),
            }],
            total_score: 7.0,
            max_total_score: 9.0,
            overall_level: "Band 7.0".into(),
            strengths: vec!["Clear".into()],
            weaknesses: vec![],
            improvement_suggestions: vec![],
            practice_directions: vec![],
            evidence: vec![],
        }],
    };
    let json_text = serde_json::to_string(&valid).unwrap();

    Mock::given(method("POST"))
        .and(path(
            "/v1beta/models/gemini-flash-lite-latest:generateContent",
        ))
        .and(query_param("key", "test-key"))
        .and(wiremock::matchers::body_partial_json(json!({
            "systemInstruction": {
                "parts": [{ "text": PromptProfile::default().system_instruction }]
            },
            "generationConfig": {
                "temperature": 0.25
            }
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "candidates": [{
                "content": {
                    "parts": [{ "text": json_text }]
                }
            }]
        })))
        .mount(&server)
        .await;

    let client = GeminiClient::with_base_url("test-key", server.uri()).unwrap();
    let uploaded = UploadedFile {
        name: "files/1".into(),
        uri: "https://example.com/files/1".into(),
        mime_type: "video/mp4".into(),
        state: "ACTIVE".into(),
    };
    let rubric = get_builtin_rubric("ielts_speaking").unwrap();
    let profile = PromptProfile::default();

    let res = client
        .grade_video(
            &uploaded,
            rubric,
            &profile,
            "gemini-flash-lite-latest",
            "presentation",
            "vi",
            None,
            "",
            MediaResolution::Low,
            None,
        )
        .await
        .unwrap();
    assert_eq!(res.students[0].student_name, "An");

    // Broken JSON response
    let bad_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(
            "/v1beta/models/gemini-flash-lite-latest:generateContent",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "candidates": [{ "content": { "parts": [{ "text": "{broken" }] } }]
        })))
        .mount(&bad_server)
        .await;
    let bad_client = GeminiClient::with_base_url("test-key", bad_server.uri()).unwrap();
    assert!(bad_client
        .grade_video(
            &uploaded,
            rubric,
            &profile,
            "gemini-flash-lite-latest",
            "presentation",
            "vi",
            None,
            "",
            MediaResolution::Low,
            None,
        )
        .await
        .is_err());
}

#[test]
fn test_media_ffmpeg_args_and_duration_parser() {
    let dir = Path::new("/tmp");
    let video = Path::new("/tmp/bai.mp4");

    let (mp3_args, mp3_out) = build_extract_mp3_args(video, "compact", dir);
    assert!(mp3_args.contains(&"-vn".to_string()));
    assert!(mp3_args.contains(&"64k".to_string()));
    assert!(mp3_args.contains(&"1".to_string()));
    assert_eq!(mp3_out.file_name().unwrap(), "bai_compact.mp3");

    let (_fallback_args, fallback_out) = build_extract_mp3_args(video, "invalid", dir);
    assert_eq!(
        fallback_out.file_name().unwrap(),
        format!("bai_{DEFAULT_MP3_PRESET}.mp3").as_str()
    );

    let (vid_args, vid_out) = build_compress_video_args(video, "tiny", dir);
    assert!(vid_args.contains(&"-vf".to_string()));
    assert!(vid_args.contains(&"scale=-2:540".to_string()));
    assert!(vid_args.contains(&"900k".to_string()));
    assert!(vid_args.contains(&"+faststart".to_string()));
    assert_eq!(vid_out.file_name().unwrap(), "bai_compressed_tiny.mp4");

    let (_def_args, def_out) = build_compress_video_args(video, "unknown", dir);
    assert_eq!(
        def_out.file_name().unwrap(),
        format!("bai_compressed_{DEFAULT_VIDEO_PRESET}.mp4").as_str()
    );

    let dur = parse_duration_from_stderr("  Duration: 00:01:23.45, start: 0.000000").unwrap();
    assert!((dur - 83.45).abs() < 0.01);
}

#[tokio::test]
async fn test_real_ffmpeg_extract_and_compress_if_available() {
    let Some(ffmpeg) = resolve_ffmpeg(None, None) else {
        return; // skip gracefully if ffmpeg isn't installed in test env
    };

    let dir = TempDir::new().unwrap();
    let sample_video = dir.path().join("sample.mp4");

    // Generate a 1-second silent test video via ffmpeg lavfi
    let status = tokio::process::Command::new(&ffmpeg)
        .args([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x240:d=1",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-t",
            "1",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            sample_video.to_str().unwrap(),
        ])
        .output()
        .await
        .unwrap();

    if !status.status.success() || !sample_video.exists() {
        return;
    }

    let mp3 = extract_mp3(&ffmpeg, &sample_video, "compact", dir.path(), |_| {}, None)
        .await
        .unwrap();
    assert!(mp3.exists());
    assert!(tokio::fs::metadata(&mp3).await.unwrap().len() > 0);

    let compressed = compress_video(&ffmpeg, &sample_video, "light", dir.path(), |_| {}, None)
        .await
        .unwrap();
    assert!(compressed.exists());
    assert!(tokio::fs::metadata(&compressed).await.unwrap().len() > 0);
}

#[test]
fn test_trim_and_mute_args_builders() {
    let input = Path::new("/tmp/speaking.mp4");
    let out_mp4 = Path::new("/exports/custom_clip.mp4");

    // Validation guards
    assert!(build_trim_media_args_to(input, -1.0, Some(5.0), true, out_mp4).is_err());
    assert!(build_trim_media_args_to(input, 10.0, Some(8.0), true, out_mp4).is_err());
    assert!(build_trim_media_args_to(input, 10.0, Some(10.0), true, out_mp4).is_err());

    // Fast stream-copy trim
    let copy_args = build_trim_media_args_to(input, 5.5, Some(20.5), true, out_mp4).unwrap();
    assert!(copy_args.windows(2).any(|w| w == ["-ss", "5.500"]));
    assert!(copy_args.windows(2).any(|w| w == ["-t", "15.000"]));
    assert!(copy_args.windows(2).any(|w| w == ["-c", "copy"]));
    assert_eq!(copy_args.last().unwrap(), "/exports/custom_clip.mp4");

    // Re-encode trim to mp3
    let out_mp3 = Path::new("/exports/clip.mp3");
    let reencode_mp3 = build_trim_media_args_to(input, 2.0, None, false, out_mp3).unwrap();
    assert!(reencode_mp3.contains(&"libmp3lame".to_string()));
    assert!(!reencode_mp3.contains(&"-t".to_string()));

    // Mute video
    let mute_args = build_mute_video_args_to(input, out_mp4);
    assert!(mute_args.contains(&"-an".to_string()));
    assert!(mute_args.windows(2).any(|w| w == ["-c:v", "copy"]));
    assert!(mute_args.contains(&"+faststart".to_string()));
}
