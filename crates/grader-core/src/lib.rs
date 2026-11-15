pub mod database;
pub mod error;
pub mod export;
pub mod gemini;
pub mod media;
pub mod paths;
pub mod prompts;
pub mod rubrics;
pub mod schemas;

pub use database::{AssessmentDetail, AssessmentSummary, Database, NewAssessment, StudentRecord};
pub use error::{GraderError, Result};
pub use gemini::{
    build_transcription_prompt, normalize_transcript_result, CachedUpload, GeminiClient,
    MediaResolution, TranscribeOptions, UploadCache, UploadProgress, UploadedFile, DEFAULT_MODEL,
    FALLBACK_MODELS, UPLOAD_TTL_SECS,
};
pub use media::{
    build_edit_video_args_to, build_embed_subtitles_video_args_to,
    build_embed_subtitles_video_args_with_fonts_to,
    build_embed_subtitles_video_args_with_options_to, build_export_segment_clip_args_to,
    build_extract_speech_mp3_args_to, build_merge_videos_fast_concat_args_to,
    build_merge_videos_filter_complex_args_to, compress_video, compress_video_to, edit_video_to,
    embed_subtitles_video_to, embed_subtitles_video_with_fonts_to,
    embed_subtitles_video_with_options_to, escape_ffmpeg_filter_path, export_segment_clip_to,
    extract_mp3, extract_mp3_to, extract_speech_mp3_to, get_mp3_preset, get_video_preset,
    merge_videos_to, mp3_presets, mute_video_to, parse_has_audio_from_stderr,
    parse_video_dimensions_from_stderr, probe_duration_secs, probe_video_dimensions,
    resolve_ffmpeg, trim_media_to, video_presets, MediaProgress, MergeVideoInput, Mp3Preset,
    TrimRange, VideoAdjustments, VideoEditOptions, VideoPreset, DEFAULT_MP3_PRESET,
    DEFAULT_VIDEO_PRESET,
};
pub use paths::AppPaths;
pub use prompts::{
    build_grading_prompt, build_prompt_parts, build_prompt_parts_with_images, PromptParts,
    PromptProfile,
};
pub use rubrics::{
    builtin_rubrics, detect_image_mime, encode_base64, fmt_num, format_result_markdown,
    get_builtin_rubric, AssignmentImage, Criterion, CriterionLevel, GradingAssignment, Rubric,
};
pub use schemas::{
    assessment_result_gemini_schema, format_transcript_ass, format_transcript_ass_with_options,
    format_transcript_markdown, format_transcript_srt, format_transcript_srt_with_mode,
    format_transcript_srt_with_options, format_transcript_text, transcript_result_gemini_schema,
    AssSubtitleOptions, AssessmentResult, CriterionScore, Evidence, StudentAssessment,
    TranscriptResult, TranscriptSegment, TranscriptSpeaker,
};
