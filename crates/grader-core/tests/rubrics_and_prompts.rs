use std::collections::BTreeMap;

use grader_core::prompts::{build_grading_prompt, merge_with_default, PromptProfile};
use grader_core::rubrics::{
    builtin_rubrics, format_result_markdown, get_builtin_rubric, Criterion, Rubric,
};
use grader_core::schemas::{
    assessment_result_gemini_schema, AssessmentResult, CriterionScore, Evidence, StudentAssessment,
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
    assert_eq!(ielts.max_total(), 36.0);
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
        criteria: vec![
            Criterion::new("A", "desc A", 0.0, 5.0),
            Criterion::new("B", "desc B", 0.0, 10.0),
        ],
    };
    assert_eq!(r.max_total(), 15.0);
    let block = r.to_prompt_block();
    assert!(block.contains("RUBRIC: Custom"));
    assert!(block.contains("1. A (điểm 0–5): desc A"));
    assert!(block.contains("Tổng điểm tối đa: 15"));
    assert!(r.to_markdown().contains("### Custom"));
}

#[test]
fn test_gemini_schema_has_no_refs_or_defs() {
    let schema = assessment_result_gemini_schema();
    let s = serde_json::to_string(&schema).unwrap();
    assert!(!s.contains("$ref"), "schema should inline $ref: {s}");
    assert!(!s.contains("$defs"), "schema should strip $defs: {s}");
    assert!(!s.contains("definitions"), "schema should strip definitions: {s}");
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
    };
    let merged = merge_with_default(partial);
    assert_eq!(merged.system_instruction, "Custom sys");
    assert!(!merged.names_with_list.is_empty());
    assert!(merged.task_types.contains_key("presentation"));
    assert!(merged.feedback_languages.contains_key("bilingual"));
}

#[test]
fn test_format_result_markdown_renders_students_and_evidence() {
    let md = format_result_markdown(&sample_result());
    assert!(md.contains("### 1. An"));
    assert!(md.contains("### 2. Học sinh 2  _(tên tạm — cần gán lại)_"));
    assert!(md.contains("`00:32` — I really enjoy reading novels."));
}
