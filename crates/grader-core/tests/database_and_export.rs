use calamine::{open_workbook, Data, Reader, Xlsx};
use grader_core::database::{Database, NewAssessment};
use grader_core::export::{default_export_path, export_to_excel, safe_sheet_title, slug};
use grader_core::prompts::PromptProfile;
use grader_core::rubrics::{Criterion, Rubric};
use grader_core::schemas::{AssessmentResult, CriterionScore, Evidence, StudentAssessment};
use tempfile::TempDir;

fn sample_result() -> AssessmentResult {
    AssessmentResult {
        task_summary: "Presentation about hobbies".into(),
        detected_language: "English".into(),
        general_notes: "Good class energy".into(),
        students: vec![
            StudentAssessment {
                student_name: "An".into(),
                name_confident: true,
                criteria: vec![CriterionScore {
                    criterion: "Fluency and Coherence".into(),
                    score: 6.5,
                    max_score: 9.0,
                    comment: "Tốt".into(),
                }],
                total_score: 6.5,
                max_total_score: 9.0,
                overall_level: "Band 6.5".into(),
                strengths: vec!["Trôi chảy".into()],
                weaknesses: vec!["Lặp từ".into()],
                improvement_suggestions: vec!["Đa dạng từ nối".into()],
                practice_directions: vec!["Shadowing".into()],
                evidence: vec![Evidence {
                    timestamp: "00:15".into(),
                    quote: "My hobby is reading.".into(),
                    note: "Rõ ràng".into(),
                }],
            },
            StudentAssessment {
                student_name: "Học sinh 2".into(),
                name_confident: false,
                criteria: vec![CriterionScore {
                    criterion: "Fluency and Coherence".into(),
                    score: 5.5,
                    max_score: 9.0,
                    comment: "Cần tự tin hơn".into(),
                }],
                total_score: 5.5,
                max_total_score: 9.0,
                overall_level: "Band 5.5".into(),
                strengths: vec!["Ý tưởng tốt".into()],
                weaknesses: vec!["Ngập ngừng".into()],
                improvement_suggestions: vec!["Luyện nói chậm".into()],
                practice_directions: vec!["Ghi âm".into()],
                evidence: vec![],
            },
        ],
    }
}

#[test]
fn test_db_init_seeds_rubrics_and_prompt() {
    let dir = TempDir::new().unwrap();
    let db = Database::new(dir.path().join("grader.db"));
    db.init().unwrap();

    let rubrics = db.list_rubrics().unwrap();
    assert_eq!(rubrics.len(), 5);
    assert!(rubrics.iter().all(|r| r.is_builtin));

    let prompt = db.load_prompt_profile().unwrap();
    assert_eq!(prompt.id, "default");
    assert!(prompt.task_types.contains_key("presentation"));
}

#[test]
fn test_settings_crud() {
    let dir = TempDir::new().unwrap();
    let db = Database::new(dir.path().join("grader.db"));
    db.init().unwrap();

    assert_eq!(db.get_setting("gemini_api_key").unwrap(), None);
    db.set_setting("gemini_api_key", "AIzaTest123").unwrap();
    assert_eq!(
        db.get_setting("gemini_api_key").unwrap().as_deref(),
        Some("AIzaTest123")
    );
    db.set_setting("gemini_api_key", "AIzaUpdated").unwrap();
    assert_eq!(
        db.get_setting("gemini_api_key").unwrap().as_deref(),
        Some("AIzaUpdated")
    );
    db.delete_setting("gemini_api_key").unwrap();
    assert_eq!(db.get_setting("gemini_api_key").unwrap(), None);
}

#[test]
fn test_custom_rubric_crud_and_clone() {
    let dir = TempDir::new().unwrap();
    let db = Database::new(dir.path().join("grader.db"));
    db.init().unwrap();

    let custom = Rubric {
        id: "my_rubric".into(),
        name: "Rubric Của Tôi".into(),
        description: "Mô tả".into(),
        scale_note: "0-10".into(),
        is_builtin: false,
        criteria: vec![
            Criterion::new("Nội dung", "ý tưởng", 0.0, 10.0),
            Criterion::new("Phát âm", "rõ", 0.0, 10.0),
        ],
    };
    db.save_custom_rubric(&custom).unwrap();
    let loaded = db.get_rubric("my_rubric").unwrap().unwrap();
    assert!(!loaded.is_builtin);
    assert_eq!(loaded.criteria.len(), 2);

    // Clone built-in rubric
    let cloned = db
        .clone_rubric("ielts_speaking", "ielts_custom", "IELTS Lớp 10")
        .unwrap();
    assert!(!cloned.is_builtin);
    assert_eq!(cloned.criteria.len(), 4);

    // Reject modifying/deleting built-in
    let mut collision = custom.clone();
    collision.id = "ielts_speaking".into();
    assert!(db.save_custom_rubric(&collision).is_err());
    assert!(db.delete_custom_rubric("ielts_speaking").is_err());

    db.delete_custom_rubric("my_rubric").unwrap();
    assert!(db.get_rubric("my_rubric").unwrap().is_none());
}

#[test]
fn test_prompt_profile_save_and_reset() {
    let dir = TempDir::new().unwrap();
    let db = Database::new(dir.path().join("grader.db"));
    db.init().unwrap();

    let mut p = db.load_prompt_profile().unwrap();
    p.system_instruction = "Custom instruction".into();
    p.temperature = 0.15;
    p.strictness = "strict".into();
    db.save_prompt_profile(&p).unwrap();
    let loaded = db.load_prompt_profile().unwrap();
    assert_eq!(loaded.system_instruction, "Custom instruction");
    assert!((loaded.temperature - 0.15).abs() < 1e-5);
    assert_eq!(loaded.strictness, "strict");

    let cloned = db
        .clone_prompt_profile("default", "ielts_strict", "IELTS Khắt khe")
        .unwrap();
    assert_eq!(cloned.id, "ielts_strict");
    db.set_active_prompt_profile("ielts_strict").unwrap();
    assert_eq!(db.active_prompt_profile_id().unwrap(), "ielts_strict");
    assert!(db.list_prompt_profiles().unwrap().len() >= 2);
    assert!(db.delete_prompt_profile("default").is_err());

    db.delete_prompt_profile("ielts_strict").unwrap();
    assert_eq!(db.active_prompt_profile_id().unwrap(), "default");

    let reset = db.reset_prompt_profile().unwrap();
    assert_eq!(reset, PromptProfile::default());
}

#[test]
fn test_assessment_roundtrip_search_rename_and_delete() {
    let dir = TempDir::new().unwrap();
    let db = Database::new(dir.path().join("grader.db"));
    db.init().unwrap();

    let res = sample_result();
    let id1 = db
        .save_assessment(&NewAssessment {
            video_name: "bai1.mp4",
            video_path: Some("/tmp/bai1.mp4"),
            video_size_bytes: Some(1024),
            rubric_id: "ielts_speaking",
            rubric_name: "IELTS Speaking",
            task_type: "presentation",
            model: "gemini-flash-lite-latest",
            feedback_lang: "vi",
            media_resolution: "low",
            duration_ms: Some(1500),
            result: &res,
        })
        .unwrap();

    let detail = db.get_assessment(id1).unwrap().unwrap();
    assert_eq!(detail.students.len(), 2);
    assert_eq!(detail.students[1].assessment.student_name, "Học sinh 2");
    assert!(!detail.students[1].assessment.name_confident);

    // Inline student rename!
    let hs2_id = detail.students[1].id;
    db.rename_student(hs2_id, "Trần Minh Bình").unwrap();

    let updated = db.get_assessment(id1).unwrap().unwrap();
    assert_eq!(updated.students[1].assessment.student_name, "Trần Minh Bình");
    assert_eq!(updated.students[1].original_ai_name, "Học sinh 2");
    assert!(updated.students[1].assessment.name_confident);

    // Search by renamed student name
    let hits = db.list_assessments(Some("Minh Bình"), 50).unwrap();
    assert_eq!(hits.len(), 1);
    assert!(hits[0].student_names.contains("Trần Minh Bình"));

    let no_hits = db.list_assessments(Some("Không tồn tại"), 50).unwrap();
    assert!(no_hits.is_empty());

    db.delete_assessment(id1).unwrap();
    assert!(db.get_assessment(id1).unwrap().is_none());
}

#[test]
fn test_export_to_excel_structure_and_sheet_helpers() {
    let dir = TempDir::new().unwrap();
    let out_path = dir.path().join("ket_qua.xlsx");
    let res = sample_result();

    export_to_excel(&res, "bai1.mp4", "IELTS Speaking", &out_path).unwrap();
    assert!(out_path.exists());

    let mut wb: Xlsx<_> = open_workbook(&out_path).unwrap();
    let names = wb.sheet_names().to_vec();
    assert_eq!(names.len(), 1 + res.students.len());
    assert_eq!(names[0], "Tổng quan");

    let range = wb.worksheet_range("Tổng quan").unwrap();
    assert_eq!(range.get((2, 1)), Some(&Data::String("bai1.mp4".into())));
    assert_eq!(
        range.get((3, 1)),
        Some(&Data::String("IELTS Speaking".into()))
    );
    assert_eq!(range.get((5, 1)), Some(&Data::String("English".into())));
    assert_eq!(range.get((9, 0)), Some(&Data::String("An".into())));
    assert_eq!(range.get((9, 1)), Some(&Data::Float(6.5)));

    // Helper checks
    let long_title = safe_sheet_title(&"A".repeat(100), 1);
    assert!(long_title.chars().count() <= 31);
    assert!(long_title.starts_with("1. "));

    let cleaned = safe_sheet_title("Tên/có:ký*tự[cấm]", 2);
    assert!(!cleaned.chars().any(|c| ":\\/?*[]".contains(c)));
    assert_eq!(safe_sheet_title("   ", 3), "3. HS 3");

    assert_eq!(slug("bai noi 1"), "bai_noi_1");
    assert_eq!(slug("a/b*c"), "a_b_c");
    assert_eq!(slug(""), "ket_qua");
    assert_eq!(slug("!!!"), "ket_qua");

    let auto = default_export_path(dir.path(), "my video.mp4");
    assert_eq!(auto.extension().and_then(|s| s.to_str()), Some("xlsx"));
}
