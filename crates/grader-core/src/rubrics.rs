use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

use crate::schemas::AssessmentResult;

/// Một tiêu chí chấm điểm trong rubric.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Criterion {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub min_score: f64,
    pub max_score: f64,
}

impl Criterion {
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        min_score: f64,
        max_score: f64,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            min_score,
            max_score,
        }
    }
}

/// Một bộ tiêu chí chấm điểm hoàn chỉnh (dùng chung cho cả mặc định và tùy chỉnh).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Rubric {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub scale_note: String,
    #[serde(default)]
    pub is_builtin: bool,
    #[serde(default)]
    pub criteria: Vec<Criterion>,
}

impl Rubric {
    pub fn max_total(&self) -> f64 {
        self.criteria.iter().map(|c| c.max_score).sum()
    }

    /// Chuyển rubric thành đoạn text mô tả để nhúng vào prompt gửi Gemini.
    pub fn to_prompt_block(&self) -> String {
        let mut lines = vec![format!("RUBRIC: {}", self.name), self.description.clone()];
        if !self.scale_note.is_empty() {
            lines.push(format!("Thang điểm: {}", self.scale_note));
        }
        lines.push("Các tiêu chí:".to_string());
        for (i, c) in self.criteria.iter().enumerate() {
            lines.push(format!(
                "  {}. {} (điểm {}–{}): {}",
                i + 1,
                c.name,
                fmt_num(c.min_score),
                fmt_num(c.max_score),
                c.description
            ));
        }
        lines.push(format!("Tổng điểm tối đa: {}", fmt_num(self.max_total())));
        lines.join("\n")
    }

    /// Render rubric thành khối Markdown đầy đủ.
    pub fn to_markdown(&self) -> String {
        let rows: Vec<String> = self
            .criteria
            .iter()
            .map(|c| {
                format!(
                    "| {} | {} | {}–{} |",
                    c.name,
                    c.description,
                    fmt_num(c.min_score),
                    fmt_num(c.max_score)
                )
            })
            .collect();

        let scale_part = if self.scale_note.is_empty() {
            String::new()
        } else {
            format!("*Thang điểm:* {}\n\n", self.scale_note)
        };

        format!(
            "### {}\n`{}` · Tổng tối đa: **{}** điểm\n\n{}\n\n{}| Tiêu chí | Mô tả | Điểm |\n|---|---|---|\n{}",
            self.name,
            self.id,
            fmt_num(self.max_total()),
            self.description,
            scale_part,
            rows.join("\n")
        )
    }
}

/// Format float concisely (no trailing `.0` for whole numbers).
pub fn fmt_num(v: f64) -> String {
    if v.fract().abs() < 1e-9 {
        format!("{}", v.round() as i64)
    } else {
        let s = format!("{v:.2}");
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

static BUILTIN_RUBRIC_LIST: LazyLock<Vec<Rubric>> = LazyLock::new(|| {
    vec![
        Rubric {
            id: "ielts_speaking".into(),
            name: "IELTS Speaking".into(),
            description: "Chuẩn IELTS Speaking, 4 tiêu chí, mỗi tiêu chí thang band 0–9.".into(),
            scale_note: "Mỗi tiêu chí 0–9 (bước 0.5). Band tổng là trung bình cộng làm tròn 0.5.".into(),
            is_builtin: true,
            criteria: vec![
                Criterion::new("Fluency and Coherence", "Độ trôi chảy, mạch lạc, khả năng nói liên tục, dùng từ nối, triển khai ý.", 0.0, 9.0),
                Criterion::new("Lexical Resource", "Vốn từ vựng, độ chính xác và linh hoạt khi dùng từ, collocation, paraphrase.", 0.0, 9.0),
                Criterion::new("Grammatical Range and Accuracy", "Đa dạng cấu trúc ngữ pháp và độ chính xác.", 0.0, 9.0),
                Criterion::new("Pronunciation", "Phát âm, trọng âm, ngữ điệu, độ dễ nghe hiểu.", 0.0, 9.0),
            ],
        },
        Rubric {
            id: "cefr".into(),
            name: "CEFR (Khung tham chiếu châu Âu)".into(),
            description: "Đánh giá theo khung CEFR, quy về thang 0–6 tương ứng A1→C2.".into(),
            scale_note: "0=dưới A1, 1=A1, 2=A2, 3=B1, 4=B2, 5=C1, 6=C2. Ghi overall_level bằng nhãn A1..C2.".into(),
            is_builtin: true,
            criteria: vec![
                Criterion::new("Range (Vốn ngôn ngữ)", "Khả năng diễn đạt đa dạng ý tưởng, chủ đề.", 0.0, 6.0),
                Criterion::new("Accuracy (Độ chính xác)", "Mức độ chính xác về ngữ pháp và từ vựng.", 0.0, 6.0),
                Criterion::new("Fluency (Độ trôi chảy)", "Khả năng nói liên tục, tự nhiên.", 0.0, 6.0),
                Criterion::new("Interaction (Tương tác)", "Khả năng bắt nhịp hội thoại, phản hồi phù hợp.", 0.0, 6.0),
                Criterion::new("Coherence (Mạch lạc)", "Khả năng liên kết ý, dùng từ nối logic.", 0.0, 6.0),
            ],
        },
        Rubric {
            id: "cambridge_school".into(),
            name: "Cambridge (KET/PET style)".into(),
            description: "Phong cách Cambridge cho học sinh phổ thông, mỗi tiêu chí thang 0–5.".into(),
            scale_note: "Mỗi tiêu chí 0–5.".into(),
            is_builtin: true,
            criteria: vec![
                Criterion::new("Grammar and Vocabulary", "Ngữ pháp và từ vựng phù hợp trình độ.", 0.0, 5.0),
                Criterion::new("Pronunciation", "Phát âm rõ, đúng trọng âm và ngữ điệu.", 0.0, 5.0),
                Criterion::new("Interactive Communication", "Khả năng khởi xướng và duy trì hội thoại.", 0.0, 5.0),
                Criterion::new("Discourse Management", "Độ dài, mạch lạc, liên quan của phần trả lời.", 0.0, 5.0),
            ],
        },
        Rubric {
            id: "toefl_speaking".into(),
            name: "TOEFL Speaking".into(),
            description: "Chuẩn TOEFL Speaking, mỗi tiêu chí thang 0–4.".into(),
            scale_note: "Mỗi tiêu chí 0–4 (có thể quy đổi ra thang 30 sau).".into(),
            is_builtin: true,
            criteria: vec![
                Criterion::new("Delivery", "Độ trôi chảy, phát âm, nhịp độ, dễ nghe.", 0.0, 4.0),
                Criterion::new("Language Use", "Sử dụng ngữ pháp và từ vựng hiệu quả, chính xác.", 0.0, 4.0),
                Criterion::new("Topic Development", "Triển khai ý đầy đủ, mạch lạc, liên kết tốt.", 0.0, 4.0),
            ],
        },
        Rubric {
            id: "classroom_10".into(),
            name: "Lớp học chung (thang 10)".into(),
            description: "Rubric tổng quát cho lớp học, mỗi tiêu chí thang 0–10.".into(),
            scale_note: "Mỗi tiêu chí 0–10.".into(),
            is_builtin: true,
            criteria: vec![
                Criterion::new("Nội dung", "Ý tưởng phong phú, đúng chủ đề, thuyết phục.", 0.0, 10.0),
                Criterion::new("Từ vựng", "Dùng từ đa dạng, chính xác, phù hợp ngữ cảnh.", 0.0, 10.0),
                Criterion::new("Ngữ pháp", "Câu đúng ngữ pháp, đa dạng cấu trúc.", 0.0, 10.0),
                Criterion::new("Phát âm", "Phát âm rõ ràng, đúng trọng âm, ngữ điệu tự nhiên.", 0.0, 10.0),
                Criterion::new("Trôi chảy", "Nói liên tục, ít ngập ngừng.", 0.0, 10.0),
                Criterion::new("Tự tin và tương tác", "Thái độ tự tin, giao tiếp bằng mắt, phản hồi tốt.", 0.0, 10.0),
            ],
        },
    ]
});

/// Danh sách 5 rubric mặc định.
pub fn builtin_rubrics() -> &'static [Rubric] {
    &BUILTIN_RUBRIC_LIST
}

/// Tìm rubric mặc định theo `id`.
pub fn get_builtin_rubric(id: &str) -> Option<&'static Rubric> {
    BUILTIN_RUBRIC_LIST.iter().find(|r| r.id == id)
}

/// Chuyển kết quả chấm điểm thành Markdown.
pub fn format_result_markdown(result: &AssessmentResult) -> String {
    let mut lines = vec![
        "## Kết quả chấm điểm".to_string(),
        String::new(),
        format!("**Ngôn ngữ nói:** {}  ", result.detected_language),
        format!("**Tóm tắt:** {}", result.task_summary),
    ];
    if !result.general_notes.is_empty() {
        lines.push(format!("\n**Ghi chú chung:** {}", result.general_notes));
    }
    lines.push(String::new());

    for (idx, s) in result.students.iter().enumerate() {
        let conf = if s.name_confident {
            ""
        } else {
            "  _(tên tạm — cần gán lại)_"
        };
        lines.push(format!("---\n### {}. {}{}", idx + 1, s.student_name, conf));
        lines.push(format!(
            "**Tổng điểm:** {} / {}  |  **Xếp loại:** {}\n",
            fmt_num(s.total_score),
            fmt_num(s.max_total_score),
            s.overall_level
        ));
        lines.push("| Tiêu chí | Điểm | Nhận xét |".to_string());
        lines.push("|---|---|---|".to_string());
        for c in &s.criteria {
            let comment = c.comment.replace('\n', " ").replace('|', "/");
            lines.push(format!(
                "| {} | {}/{} | {} |",
                c.criterion,
                fmt_num(c.score),
                fmt_num(c.max_score),
                comment
            ));
        }
        lines.push(String::new());

        let mut push_block = |title: &str, items: &[String]| {
            if !items.is_empty() {
                lines.push(format!("**{title}:**"));
                for it in items {
                    lines.push(format!("- {it}"));
                }
                lines.push(String::new());
            }
        };

        push_block("Điểm mạnh", &s.strengths);
        push_block("Điểm yếu", &s.weaknesses);
        push_block("Gợi ý cải thiện", &s.improvement_suggestions);
        push_block("Hướng luyện tập", &s.practice_directions);

        if !s.evidence.is_empty() {
            lines.push("**Dẫn chứng (timestamp):**".to_string());
            for ev in &s.evidence {
                lines.push(format!("- `{}` — {} _({})_", ev.timestamp, ev.quote, ev.note));
            }
            lines.push(String::new());
        }
    }

    lines.join("\n")
}
