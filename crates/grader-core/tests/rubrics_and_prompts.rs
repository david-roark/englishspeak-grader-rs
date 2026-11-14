use std::collections::BTreeMap;

use grader_core::gemini::{build_transcription_prompt, TranscribeOptions};
use grader_core::prompts::{
    build_grading_prompt, build_prompt_parts, build_prompt_parts_with_images, merge_with_default,
    PromptProfile,
};
use grader_core::rubrics::{
    builtin_rubrics, detect_image_mime, encode_base64, format_result_markdown, get_builtin_rubric,
    AssignmentImage, Criterion, CriterionLevel, Rubric,
};
use grader_core::schemas::{
    assessment_result_gemini_schema, format_transcript_ass, format_transcript_markdown,
    format_transcript_srt, format_transcript_srt_with_mode, format_transcript_text,
    transcript_result_gemini_schema, AssessmentResult, CriterionScore, Evidence, StudentAssessment,
    TranscriptResult, TranscriptSegment, TranscriptSpeaker,
};

fn sample_result() -> AssessmentResult {
    AssessmentResult {
        task_summary: "Học sinh trình bày về sở thích đọc sách.".into(),
        detected_language: "English".into(),
        general_notes: "Phát âm khá rõ.".into(),
        students: vec![
            StudentAssessment {
                student_name: "An".into(),
                name_confident: true,
                criteria: vec![
                    CriterionScore {
                        criterion: "Fluency and Coherence".into(),
                        score: 6.5,
                        max_score: 9.0,
                        comment: "Nói khá trôi chảy".into(),
                    },
                    CriterionScore {
                        criterion: "Pronunciation".into(),
                        score: 6.5,
                        max_score: 9.0,
                        comment: "Rõ ràng".into(),
                    },
                ],
                total_score: 6.5,
                max_total_score: 9.0,
                overall_level: "Band 6.5".into(),
                strengths: vec!["Tự tin".into()],
                weaknesses: vec!["Đôi chỗ lặp từ".into()],
                improvement_suggestions: vec!["Dùng thêm từ nối".into()],
                practice_directions: vec!["Shadowing 10 phút/ngày".into()],
                evidence: vec![Evidence {
                    timestamp: "00:32".into(),
                    quote: "I really enjoy reading novels.".into(),
                    note: "Ngữ điệu tự nhiên".into(),
                }],
            },
            StudentAssessment {
                student_name: "Học sinh 2".into(),
                name_confident: false,
                criteria: vec![CriterionScore {
                    criterion: "Fluency and Coherence".into(),
                    score: 5.5,
                    max_score: 9.0,
                    comment: "Hơi ngập ngừng".into(),
                }],
                total_score: 5.5,
                max_total_score: 9.0,
                overall_level: "Band 5.5".into(),
                strengths: vec!["Từ vựng ổn".into()],
                weaknesses: vec!["Ngập ngừng".into()],
                improvement_suggestions: vec!["Luyện nói theo dàn ý".into()],
                practice_directions: vec!["Ghi âm 2 phút mỗi ngày".into()],
                evidence: vec![],
            },
        ],
    }
}

#[test]
fn test_builtin_rubrics_complete_and_valid() {
    let list = builtin_rubrics();
    assert_eq!(list.len(), 5);
    let ids: Vec<&str> = list.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(
        ids,
        vec![
            "ielts_speaking",
            "cefr",
            "cambridge_school",
            "toefl_speaking",
            "classroom_10"
        ]
    );
    let ielts = get_builtin_rubric("ielts_speaking").unwrap();
    assert_eq!(ielts.name, "IELTS Speaking");
    assert_eq!(ielts.max_total(), 9.0);
    let classroom = get_builtin_rubric("classroom_10").unwrap();
    assert_eq!(classroom.max_total(), 10.0);
    assert!(get_builtin_rubric("nonexistent").is_none());
}

#[test]
fn test_rubric_max_total_and_prompt_block() {
    let r = Rubric {
        id: "k".into(),
        name: "Custom".into(),
        description: "Desc".into(),
        scale_note: "0-15".into(),
        is_builtin: false,
        scoring_mode: "sum".into(),
        target_scale: None,
        rounding_step: None,
        criteria: vec![
            Criterion::new("A", "desc A", 0.0, 5.0).with_levels(vec![CriterionLevel {
                label: "Tốt".into(),
                score_range: "4.5–5".into(),
                description: "Nói rõ ràng".into(),
            }]),
            Criterion::new("B", "desc B", 0.0, 10.0),
        ],
    };
    assert_eq!(r.max_total(), 15.0);
    let block = r.to_prompt_block();
    assert!(block.contains("RUBRIC: Custom"));
    assert!(block.contains("1. A (điểm 0–5): desc A"));
    assert!(block.contains("Mức Tốt (4.5–5): Nói rõ ràng"));
    assert!(block.contains("Tổng điểm tối đa: 15"));
    assert!(r.to_markdown().contains("### Custom"));

    // Weighted average & normalization test (IELTS: average 6.5, 6.5, 7.0, 7.0 -> 6.75 -> rounds to 7.0)
    let ielts = get_builtin_rubric("ielts_speaking").unwrap();
    let (tot, max_tot) = ielts.compute_total_score(&[
        CriterionScore {
            criterion: "Fluency and Coherence".into(),
            score: 6.5,
            max_score: 9.0,
            comment: "".into(),
        },
        CriterionScore {
            criterion: "Lexical Resource".into(),
            score: 6.5,
            max_score: 9.0,
            comment: "".into(),
        },
        CriterionScore {
            criterion: "Grammatical Range and Accuracy".into(),
            score: 7.0,
            max_score: 9.0,
            comment: "".into(),
        },
        CriterionScore {
            criterion: "Pronunciation".into(),
            score: 7.0,
            max_score: 9.0,
            comment: "".into(),
        },
    ]);
    assert_eq!(max_tot, 9.0);
    assert_eq!(tot, 7.0);
}

#[test]
fn test_gemini_schema_has_no_refs_or_defs() {
    let schema = assessment_result_gemini_schema();
    let s = serde_json::to_string(&schema).unwrap();
    assert!(!s.contains("$ref"), "schema should inline $ref: {s}");
    assert!(!s.contains("$defs"), "schema should strip $defs: {s}");
    assert!(
        !s.contains("definitions"),
        "schema should strip definitions: {s}"
    );
    assert!(!s.contains("$schema"), "schema should strip $schema: {s}");
    assert!(schema["properties"]["students"]["items"]["properties"]["criteria"].is_object());
}

#[test]
fn test_build_grading_prompt_variants_and_safe_placeholders() {
    let rubric = get_builtin_rubric("ielts_speaking").unwrap();
    let mut profile = PromptProfile::default();

    let p1 = build_grading_prompt(
        &profile,
        rubric,
        "presentation",
        "vi",
        Some(&["An".into(), "Bình".into()]),
        "Chú trọng phát âm",
    );
    assert!(p1.contains("IELTS Speaking"));
    assert!(p1.contains("thuyết trình cá nhân"));
    assert!(p1.contains("An, Bình"));
    assert!(p1.contains("TIẾNG VIỆT"));
    assert!(p1.contains("YÊU CẦU BỔ SUNG TỪ GIÁO VIÊN:"));
    assert!(p1.contains("Chú trọng phát âm"));

    let p2 = build_grading_prompt(&profile, rubric, "unknown_type", "en", None, "   ");
    assert!(p2.contains("Bài nói tiếng Anh nói chung."));
    assert!(p2.contains("ENGLISH"));
    assert!(p2.contains("name_confident=false"));
    assert!(!p2.contains("YÊU CẦU BỔ SUNG"));

    let p3 = build_grading_prompt(&profile, rubric, "dialogue", "bilingual", None, "");
    assert!(p3.contains("SONG NGỮ"));

    // Braces in custom template must not fail
    profile.system_instruction = "Schema {json_schema} accuracy {100%}".into();
    profile.names_with_list = "Names {names} tag {extra_tag}".into();
    let p4 = build_grading_prompt(&profile, rubric, "other", "vi", Some(&["An".into()]), "");
    assert!(p4.contains("{json_schema}"));
    assert!(p4.contains("{100%}"));
    assert!(p4.contains("{extra_tag}"));
}

#[test]
fn test_merge_with_default_restores_missing_fields() {
    let partial = PromptProfile {
        id: "default".into(),
        name: "Mặc định".into(),
        system_instruction: "Custom sys".into(),
        names_with_list: "".into(),
        names_auto_detect: "".into(),
        grading_rules: vec![],
        task_types: BTreeMap::new(),
        feedback_languages: BTreeMap::new(),
        temperature: 2.5,
        strictness: "invalid".into(),
    };
    let merged = merge_with_default(partial);
    assert_eq!(merged.system_instruction, "Custom sys");
    assert!(!merged.names_with_list.is_empty());
    assert!(merged.task_types.contains_key("presentation"));
    assert!(merged.feedback_languages.contains_key("bilingual"));
    assert_eq!(merged.temperature, 1.0);
    assert_eq!(merged.strictness, "standard");

    let strict_profile = PromptProfile {
        strictness: "strict".into(),
        ..Default::default()
    };
    let parts = build_prompt_parts(
        &strict_profile,
        get_builtin_rubric("ielts_speaking").unwrap(),
        "qa",
        "en",
        Some(&["Minh".into()]),
        "",
    );
    assert!(parts.system_instruction.contains("giám khảo"));
    assert!(!parts.user_prompt.contains(&parts.system_instruction));
    assert!(parts.user_prompt.contains("Khắt khe chuẩn thi cử"));
}

#[test]
fn test_format_result_markdown_renders_students_and_evidence() {
    let md = format_result_markdown(&sample_result());
    assert!(md.contains("### 1. An"));
    assert!(md.contains("### 2. Học sinh 2  _(tên tạm — cần gán lại)_"));
    assert!(md.contains("`00:32` — I really enjoy reading novels."));
}

#[test]
fn test_flexible_rubric_scoring_normalization_and_prompt() {
    let flex = Rubric::flexible(
        "Speaking Unit 5",
        "Trả lời đủ 4 câu hỏi (4đ), phát âm (6đ)",
        10.0,
        Some(0.5),
    );
    assert!(flex.is_flexible());
    assert_eq!(flex.max_total(), 10.0);

    let prompt_block = flex.to_prompt_block();
    assert!(prompt_block.contains("CHẾ ĐỘ CHẤM LINH HOẠT THEO ĐỀ BÀI: Speaking Unit 5"));
    assert!(prompt_block.contains("Trả lời đủ 4 câu hỏi (4đ), phát âm (6đ)"));

    let mut res = AssessmentResult {
        task_summary: "Unit 5".into(),
        detected_language: "English".into(),
        general_notes: String::new(),
        students: vec![
            StudentAssessment {
                student_name: "An".into(),
                name_confident: true,
                criteria: vec![
                    CriterionScore {
                        criterion: "Nội dung".into(),
                        score: 3.2,
                        max_score: 4.0,
                        comment: "Tốt".into(),
                    },
                    CriterionScore {
                        criterion: "Phát âm".into(),
                        score: 5.1,
                        max_score: 6.0,
                        comment: "Khá".into(),
                    },
                ],
                total_score: 8.3,
                max_total_score: 10.0,
                overall_level: "Giỏi".into(),
                strengths: vec![],
                weaknesses: vec![],
                improvement_suggestions: vec![],
                practice_directions: vec![],
                evidence: vec![],
            },
            StudentAssessment {
                student_name: "Bình".into(),
                name_confident: true,
                criteria: vec![],
                total_score: 14.2,
                max_total_score: 20.0,
                overall_level: "Đạt".into(),
                strengths: vec![],
                weaknesses: vec![],
                improvement_suggestions: vec![],
                practice_directions: vec![],
                evidence: vec![],
            },
        ],
    };
    flex.normalize_assessment_result(&mut res);
    // 3.2 + 5.1 = 8.3 -> rounded to 0.5 = 8.5
    assert_eq!(res.students[0].total_score, 8.5);
    assert_eq!(res.students[0].max_total_score, 10.0);
    // Empty criteria clamped to [0, 10]
    assert_eq!(res.students[1].total_score, 10.0);
    assert_eq!(res.students[1].max_total_score, 10.0);

    // Proportional scaling when AI outputs criteria summing to 10 on a 20-point scale
    let flex20 = Rubric::flexible("Test 20", "Đề 20đ", 20.0, Some(0.5));
    let (tot20, max20) = flex20.compute_total_score(&[
        CriterionScore {
            criterion: "A".into(),
            score: 4.0,
            max_score: 5.0,
            comment: "".into(),
        },
        CriterionScore {
            criterion: "B".into(),
            score: 4.0,
            max_score: 5.0,
            comment: "".into(),
        },
    ]);
    assert_eq!(max20, 20.0);
    assert_eq!(tot20, 16.0);
}

#[test]
fn test_build_prompt_parts_with_images_and_flexible_rules() {
    let profile = PromptProfile::default();
    let flex = Rubric::flexible("Đề tranh", "Miêu tả bức tranh", 10.0, Some(0.5));

    let parts = build_prompt_parts_with_images(&profile, &flex, "presentation", "vi", None, "", 2);
    assert!(parts
        .user_prompt
        .contains("ẢNH ĐỀ BÀI / TÀI LIỆU ĐÍNH KÈM (2 ảnh):"));
    assert!(!parts.user_prompt.contains("không tự thêm/bớt tiêu chí"));
    assert!(!parts.user_prompt.contains("GIỮ NGUYÊN như trong rubric"));
}

#[test]
fn test_encode_base64_and_assignment_image_from_file() {
    assert_eq!(encode_base64(b""), "");
    assert_eq!(encode_base64(b"f"), "Zg==");
    assert_eq!(encode_base64(b"fo"), "Zm8=");
    assert_eq!(encode_base64(b"foo"), "Zm9v");
    assert_eq!(encode_base64(b"foobar"), "Zm9vYmFy");

    assert_eq!(
        detect_image_mime(std::path::Path::new("slide.PNG")),
        Some("image/png")
    );
    assert_eq!(
        detect_image_mime(std::path::Path::new("photo.jpg")),
        Some("image/jpeg")
    );
    assert_eq!(detect_image_mime(std::path::Path::new("notes.txt")), None);

    let dir = tempfile::TempDir::new().unwrap();
    let img_path = dir.path().join("exam.png");
    std::fs::write(&img_path, b"foobar").unwrap();
    let loaded = AssignmentImage::from_file(&img_path).unwrap();
    assert_eq!(loaded.name, "exam.png");
    assert_eq!(loaded.mime_type, "image/png");
    assert_eq!(loaded.data_base64, "Zm9vYmFy");

    let bad_path = dir.path().join("notes.txt");
    std::fs::write(&bad_path, b"text").unwrap();
    assert!(AssignmentImage::from_file(&bad_path).is_err());
    assert!(AssignmentImage::from_file(&dir.path().join("missing.png")).is_err());
}

#[test]
fn test_transcript_schema_and_formatters() {
    let schema = transcript_result_gemini_schema();
    let serialized = serde_json::to_string(&schema).unwrap();
    for forbidden in [
        "\"$ref\"",
        "\"$defs\"",
        "\"definitions\"",
        "\"$schema\"",
        "\"title\"",
        "\"format\"",
        "\"default\"",
    ] {
        assert!(
            !serialized.contains(forbidden),
            "Transcript schema must not contain {forbidden}: {serialized}"
        );
    }

    let sample = TranscriptResult {
        summary: "Phỏng vấn giữa cô Lan và học sinh Minh về sở thích.".into(),
        detected_language: "English".into(),
        speakers: vec![
            TranscriptSpeaker {
                id: "T1".into(),
                label: "Cô Lan".into(),
                role: "teacher".into(),
                name_confident: true,
            },
            TranscriptSpeaker {
                id: "S1".into(),
                label: "Minh".into(),
                role: "student".into(),
                name_confident: true,
            },
        ],
        segments: vec![
            TranscriptSegment {
                start_time: "00:02".into(),
                end_time: "00:06".into(),
                speaker_id: "T1".into(),
                speaker_label: "Cô Lan".into(),
                role: "teacher".into(),
                text: "Hello Minh, what do you do in your free time?".into(),
                translation: "Chào Minh, em làm gì vào thời gian rảnh?".into(),
                grammar_note: "".into(),
            },
            TranscriptSegment {
                start_time: "00:07".into(),
                end_time: "".into(),
                speaker_id: "S1".into(),
                speaker_label: "Minh".into(),
                role: "student".into(),
                text: "I go to library yesterday and read books.".into(),
                translation: "".into(),
                grammar_note: "Nên dùng thì quá khứ: 'went to the library'.".into(),
            },
        ],
    };

    let md = format_transcript_markdown(&sample, "unit5.mp4");
    assert!(md.contains("# Script bài nói: unit5.mp4"));
    assert!(md.contains("**[00:02 - 00:06] [Giáo viên] Cô Lan:**"));
    assert!(md.contains("*Dịch:* Chào Minh"));
    assert!(md.contains("*Gợi ý sửa:* Nên dùng thì quá khứ"));

    let txt = format_transcript_text(&sample, "unit5.mp4");
    assert!(txt.contains("SCRIPT BÀI NÓI: unit5.mp4"));
    assert!(txt.contains("[00:02 - 00:06] [Giáo viên] Cô Lan:"));

    let srt = format_transcript_srt(&sample);
    assert!(srt.contains("1\n00:00:02,000 --> 00:00:06,000\n[Cô Lan]: Hello Minh"));
    assert!(srt.contains("2\n00:00:07,000 --> 00:00:10,000\n[Minh]: I go to library"));
}

#[test]
fn test_build_transcription_prompt_options() {
    let opts = TranscribeOptions {
        interaction_mode: "interview".into(),
        speaker_hints: "GV: Cô Mai; HS: Tuấn".into(),
        verbatim_mode: "clean".into(),
        include_translation: true,
        include_grammar_notes: false,
        extra_instructions: "Ghi rõ các từ phát âm sai.".into(),
    };
    let (sys, usr) = build_transcription_prompt(&opts);
    assert!(sys.contains("chuyên gia phiên âm"));
    assert!(usr.contains("Phỏng vấn Hỏi–Đáp"));
    assert!(usr.contains("LÀM SẠCH"));
    assert!(usr.contains("GV: Cô Mai; HS: Tuấn"));
    assert!(usr.contains("Ghi rõ các từ phát âm sai."));
    assert!(usr.contains("Điền bản dịch tiếng Việt ngắn gọn"));
    assert!(usr.contains("Để trống trường `grammar_note`"));
}

#[test]
fn test_format_transcript_ass_and_srt_modes() {
    let sample = TranscriptResult {
        summary: "Hội thoại mẫu".into(),
        detected_language: "English".into(),
        speakers: vec![
            TranscriptSpeaker {
                id: "T1".into(),
                label: "Cô Lan".into(),
                role: "teacher".into(),
                name_confident: true,
            },
            TranscriptSpeaker {
                id: "S1".into(),
                label: "Minh".into(),
                role: "student".into(),
                name_confident: true,
            },
        ],
        segments: vec![
            TranscriptSegment {
                start_time: "00:02".into(),
                end_time: "00:06".into(),
                speaker_id: "T1".into(),
                speaker_label: "Cô Lan".into(),
                role: "teacher".into(),
                text: "Hello Minh, read {braced} carefully.".into(),
                translation: "Chào Minh, đọc kỹ nhé.".into(),
                grammar_note: "".into(),
            },
            TranscriptSegment {
                start_time: "00:07".into(),
                end_time: "00:11".into(),
                speaker_id: "S1".into(),
                speaker_label: "Minh".into(),
                role: "student".into(),
                text: "I like read books.".into(),
                translation: "Em thích đọc sách.".into(),
                grammar_note: "Dùng 'reading books'.".into(),
            },
        ],
    };

    let srt_text_only = format_transcript_srt_with_mode(&sample, "text_only");
    assert!(srt_text_only.contains("[Cô Lan]: Hello Minh"));
    assert!(!srt_text_only.contains("Chào Minh, đọc kỹ nhé."));
    assert!(!srt_text_only.contains("reading books"));

    let srt_bilingual = format_transcript_srt_with_mode(&sample, "bilingual");
    assert!(srt_bilingual.contains("Chào Minh, đọc kỹ nhé."));
    assert!(srt_bilingual.contains("Em thích đọc sách."));
    assert!(!srt_bilingual.contains("reading books"));

    let srt_grammar = format_transcript_srt_with_mode(&sample, "with_grammar");
    assert!(!srt_grammar.contains("Chào Minh, đọc kỹ nhé."));
    assert!(srt_grammar.contains("Dùng 'reading books'."));

    let srt_all = format_transcript_srt_with_mode(&sample, "all");
    assert!(srt_all.contains("Chào Minh, đọc kỹ nhé."));
    assert!(srt_all.contains("Dùng 'reading books'."));

    let ass_all = format_transcript_ass(&sample, "all");
    assert!(ass_all.contains("[Script Info]"));
    assert!(ass_all.contains("[V4+ Styles]"));
    assert!(ass_all.contains("[Events]"));
    assert!(ass_all.contains(r"{\b1\c&H00D4FF&}[Giáo viên - Cô Lan]:"));
    assert!(ass_all.contains(r"{\b1\c&H80FF80&}[Minh]:"));
    assert!(!ass_all.contains("{braced}"));
    assert!(ass_all.contains("braced"));
    assert!(ass_all.contains(r"\N{\fs23\c&HE8E8E8&}Dịch: Chào Minh, đọc kỹ nhé."));
    assert!(ass_all.contains(r"\N{\fs23\c&H80D8FF&}Sửa: Dùng 'reading books'."));

    let ass_text_only = format_transcript_ass(&sample, "text_only");
    assert!(!ass_text_only.contains("Dịch:"));
    assert!(!ass_text_only.contains("Sửa:"));

    let ass_grammar = format_transcript_ass(&sample, "with_grammar");
    assert!(!ass_grammar.contains("Dịch:"));
    assert!(ass_grammar.contains(r"\N{\fs23\c&H80D8FF&}Sửa: Dùng 'reading books'."));
}
