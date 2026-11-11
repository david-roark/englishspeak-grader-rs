use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

use crate::schemas::{AssessmentResult, CriterionScore};

pub fn default_weight() -> f64 {
    1.0
}

pub fn default_scoring_mode() -> String {
    "sum".to_string()
}

/// Mô tả một mức đạt cụ thể trong một tiêu chí (Band / Level Descriptor).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CriterionLevel {
    pub label: String,
    #[serde(default)]
    pub score_range: String,
    #[serde(default)]
    pub description: String,
}

/// Một tiêu chí chấm điểm trong rubric.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Criterion {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub min_score: f64,
    pub max_score: f64,
    #[serde(default = "default_weight")]
    pub weight: f64,
    #[serde(default)]
    pub levels: Vec<CriterionLevel>,
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
            weight: 1.0,
            levels: Vec::new(),
        }
    }

    pub fn with_weight(mut self, weight: f64) -> Self {
        self.weight = if weight.is_finite() && weight > 0.0 {
            weight
        } else {
            1.0
        };
        self
    }

    pub fn with_levels(mut self, levels: Vec<CriterionLevel>) -> Self {
        self.levels = levels;
        self
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
    #[serde(default = "default_scoring_mode")]
    pub scoring_mode: String,
    #[serde(default)]
    pub target_scale: Option<f64>,
    #[serde(default)]
    pub rounding_step: Option<f64>,
    #[serde(default)]
    pub criteria: Vec<Criterion>,
}

pub fn round_to_step(val: f64, step: Option<f64>) -> f64 {
    if !val.is_finite() {
        return 0.0;
    }
    let rounded = match step {
        Some(s) if s.is_finite() && s > 0.0 => (val / s).round() * s,
        _ => (val * 100.0).round() / 100.0,
    };
    (rounded * 10_000.0).round() / 10_000.0
}

impl Rubric {
    pub fn is_weighted_avg(&self) -> bool {
        self.scoring_mode == "weighted_avg"
    }

    pub fn total_weight(&self) -> f64 {
        let sum: f64 = self
            .criteria
            .iter()
            .map(|c| {
                if c.weight.is_finite() && c.weight > 0.0 {
                    c.weight
                } else {
                    0.0
                }
            })
            .sum();
        if sum > 0.0 {
            sum
        } else {
            self.criteria.len().max(1) as f64
        }
    }

    pub fn max_total(&self) -> f64 {
        if self.is_weighted_avg() {
            if let Some(scale) = self.target_scale.filter(|s| s.is_finite() && *s > 0.0) {
                return round_to_step(scale, self.rounding_step);
            }
            if self.criteria.is_empty() {
                return 0.0;
            }
            let total_w = self.total_weight();
            let weighted: f64 = self
                .criteria
                .iter()
                .map(|c| {
                    let w = if c.weight.is_finite() && c.weight > 0.0 {
                        c.weight
                    } else {
                        1.0
                    };
                    c.max_score * w
                })
                .sum();
            return round_to_step(weighted / total_w, self.rounding_step);
        }

        self.criteria.iter().map(|c| c.max_score).sum()
    }

    fn match_criterion(&self, idx: usize, name: &str) -> Option<&Criterion> {
        let needle = name.trim().to_lowercase();
        self.criteria
            .iter()
            .find(|c| c.name.trim().to_lowercase() == needle)
            .or_else(|| self.criteria.get(idx))
    }

    /// Tính lại `(total_score, max_total_score)` chuẩn xác từ danh sách điểm thành phần theo công thức của rubric.
    pub fn compute_total_score(&self, scores: &[CriterionScore]) -> (f64, f64) {
        let max_total = self.max_total();
        if scores.is_empty() {
            return (0.0, max_total);
        }

        if self.is_weighted_avg() {
            let mut weighted_ratio_sum = 0.0;
            let mut weight_sum = 0.0;

            for (idx, s) in scores.iter().enumerate() {
                let matched = self.match_criterion(idx, &s.criterion);
                let (min_s, max_s, w) = match matched {
                    Some(c) => (
                        c.min_score,
                        c.max_score,
                        if c.weight.is_finite() && c.weight > 0.0 {
                            c.weight
                        } else {
                            1.0
                        },
                    ),
                    None => (0.0, s.max_score, 1.0),
                };
                let span = (max_s - min_s).max(0.0);
                let ratio = if span > 1e-9 {
                    ((s.score - min_s) / span).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                weighted_ratio_sum += ratio * w;
                weight_sum += w;
            }

            if weight_sum <= 0.0 {
                return (0.0, max_total);
            }
            let raw = (weighted_ratio_sum / weight_sum) * max_total;
            let rounded = round_to_step(raw, self.rounding_step).clamp(0.0, max_total);
            return (rounded, max_total);
        }

        let sum: f64 = scores
            .iter()
            .enumerate()
            .map(|(idx, s)| {
                let (min_s, max_s) = self
                    .match_criterion(idx, &s.criterion)
                    .map(|c| (c.min_score, c.max_score))
                    .unwrap_or((0.0, s.max_score));
                s.score.clamp(min_s, max_s.max(min_s))
            })
            .sum();
        let rounded = round_to_step(sum, self.rounding_step).clamp(0.0, max_total.max(0.0));
        (rounded, max_total)
    }

    /// Hậu kiểm kết quả Gemini: kẹp điểm tiêu chí trong [min, max] và tính lại `total_score`/`max_total_score`.
    pub fn normalize_assessment_result(&self, result: &mut AssessmentResult) {
        for student in &mut result.students {
            for (idx, s) in student.criteria.iter_mut().enumerate() {
                if let Some(c) = self.match_criterion(idx, &s.criterion) {
                    s.max_score = c.max_score;
                    s.score = round_to_step(s.score.clamp(c.min_score, c.max_score), None);
                }
            }
            if !student.criteria.is_empty() {
                let (total, max_total) = self.compute_total_score(&student.criteria);
                student.total_score = total;
                student.max_total_score = max_total;
            } else {
                student.max_total_score = self.max_total();
            }
        }
    }

    pub fn scoring_formula_summary(&self) -> String {
        let round_part = match self.rounding_step {
            Some(s) if s > 0.0 => format!(", làm tròn bước {}", fmt_num(s)),
            _ => String::new(),
        };
        if self.is_weighted_avg() {
            format!(
                "Trung bình có trọng số quy về thang {}{}",
                fmt_num(self.max_total()),
                round_part
            )
        } else {
            format!(
                "Cộng tổng điểm các tiêu chí (tối đa {}){}",
                fmt_num(self.max_total()),
                round_part
            )
        }
    }

    /// Chuyển rubric thành đoạn text mô tả để nhúng vào prompt gửi Gemini.
    pub fn to_prompt_block(&self) -> String {
        let mut lines = vec![format!("RUBRIC: {}", self.name)];
        if !self.description.trim().is_empty() {
            lines.push(self.description.clone());
        }
        lines.push(format!(
            "Cách tính tổng điểm: {}",
            self.scoring_formula_summary()
        ));
        if !self.scale_note.is_empty() {
            lines.push(format!("Thang điểm: {}", self.scale_note));
        }

        let show_weights =
            self.is_weighted_avg() || self.criteria.iter().any(|c| (c.weight - 1.0).abs() > 1e-6);
        let total_w = self.total_weight();

        lines.push("Các tiêu chí:".to_string());
        for (i, c) in self.criteria.iter().enumerate() {
            let weight_tag = if show_weights {
                let pct = (c.weight / total_w) * 100.0;
                format!(", trọng số {}%", fmt_num((pct * 10.0).round() / 10.0))
            } else {
                String::new()
            };
            lines.push(format!(
                "  {}. {} (điểm {}–{}{}): {}",
                i + 1,
                c.name,
                fmt_num(c.min_score),
                fmt_num(c.max_score),
                weight_tag,
                c.description
            ));
            for lvl in &c.levels {
                if lvl.label.trim().is_empty() && lvl.description.trim().is_empty() {
                    continue;
                }
                let range_str = if lvl.score_range.trim().is_empty() {
                    String::new()
                } else {
                    format!(" ({})", lvl.score_range.trim())
                };
                lines.push(format!(
                    "     - Mức {}{}: {}",
                    lvl.label.trim(),
                    range_str,
                    lvl.description.trim()
                ));
            }
        }
        lines.push(format!("Tổng điểm tối đa: {}", fmt_num(self.max_total())));
        lines.join("\n")
    }

    /// Render rubric thành khối Markdown đầy đủ.
    pub fn to_markdown(&self) -> String {
        let show_weights =
            self.is_weighted_avg() || self.criteria.iter().any(|c| (c.weight - 1.0).abs() > 1e-6);
        let total_w = self.total_weight();

        let rows: Vec<String> = self
            .criteria
            .iter()
            .map(|c| {
                let mut desc = c.description.clone();
                if !c.levels.is_empty() {
                    let lvl_str: Vec<String> = c
                        .levels
                        .iter()
                        .filter(|l| !l.label.trim().is_empty() || !l.description.trim().is_empty())
                        .map(|l| {
                            let rng = if l.score_range.trim().is_empty() {
                                String::new()
                            } else {
                                format!(" ({})", l.score_range.trim())
                            };
                            format!("**{}{}**: {}", l.label.trim(), rng, l.description.trim())
                        })
                        .collect();
                    if !lvl_str.is_empty() {
                        desc = format!("{}<br>{}", desc, lvl_str.join("; "));
                    }
                }
                if show_weights {
                    let pct = fmt_num(((c.weight / total_w) * 100.0 * 10.0).round() / 10.0);
                    format!(
                        "| {} | {} | {}% | {}–{} |",
                        c.name,
                        desc,
                        pct,
                        fmt_num(c.min_score),
                        fmt_num(c.max_score)
                    )
                } else {
                    format!(
                        "| {} | {} | {}–{} |",
                        c.name,
                        desc,
                        fmt_num(c.min_score),
                        fmt_num(c.max_score)
                    )
                }
            })
            .collect();

        let scale_part = if self.scale_note.is_empty() {
            String::new()
        } else {
            format!("*Thang điểm:* {}\n\n", self.scale_note)
        };

        let header = if show_weights {
            "| Tiêu chí | Mô tả | Trọng số | Điểm |\n|---|---|---|---|\n"
        } else {
            "| Tiêu chí | Mô tả | Điểm |\n|---|---|---|\n"
        };

        format!(
            "### {}\n`{}` · {} · Tổng tối đa: **{}** điểm\n\n{}\n\n{}{}{}",
            self.name,
            self.id,
            self.scoring_formula_summary(),
            fmt_num(self.max_total()),
            self.description,
            scale_part,
            header,
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
            scoring_mode: "weighted_avg".into(),
            target_scale: Some(9.0),
            rounding_step: Some(0.5),
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
            scoring_mode: "weighted_avg".into(),
            target_scale: Some(6.0),
            rounding_step: Some(0.5),
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
            scale_note: "Mỗi tiêu chí 0–5, cộng tổng tối đa 20 điểm.".into(),
            is_builtin: true,
            scoring_mode: "sum".into(),
            target_scale: None,
            rounding_step: Some(0.5),
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
            scale_note: "Mỗi tiêu chí 0–4, cộng tổng tối đa 12 điểm (có thể quy đổi ra thang 30).".into(),
            is_builtin: true,
            scoring_mode: "sum".into(),
            target_scale: None,
            rounding_step: Some(0.5),
            criteria: vec![
                Criterion::new("Delivery", "Độ trôi chảy, phát âm, nhịp độ, dễ nghe.", 0.0, 4.0),
                Criterion::new("Language Use", "Sử dụng ngữ pháp và từ vựng hiệu quả, chính xác.", 0.0, 4.0),
                Criterion::new("Topic Development", "Triển khai ý đầy đủ, mạch lạc, liên kết tốt.", 0.0, 4.0),
            ],
        },
        Rubric {
            id: "classroom_10".into(),
            name: "Lớp học chung (thang 10)".into(),
            description: "Rubric tổng quát cho lớp học, mỗi tiêu chí 0–10 và quy trung bình về thang 10.".into(),
            scale_note: "Mỗi tiêu chí 0–10; điểm tổng là trung bình có trọng số quy về thang 10 (làm tròn 0.5).".into(),
            is_builtin: true,
            scoring_mode: "weighted_avg".into(),
            target_scale: Some(10.0),
            rounding_step: Some(0.5),
            criteria: vec![
                Criterion::new("Nội dung", "Ý tưởng phong phú, đúng chủ đề, thuyết phục.", 0.0, 10.0).with_weight(20.0),
                Criterion::new("Từ vựng", "Dùng từ đa dạng, chính xác, phù hợp ngữ cảnh.", 0.0, 10.0).with_weight(15.0),
                Criterion::new("Ngữ pháp", "Câu đúng ngữ pháp, đa dạng cấu trúc.", 0.0, 10.0).with_weight(15.0),
                Criterion::new("Phát âm", "Phát âm rõ ràng, đúng trọng âm, ngữ điệu tự nhiên.", 0.0, 10.0).with_weight(20.0),
                Criterion::new("Trôi chảy", "Nói liên tục, ít ngập ngừng.", 0.0, 10.0).with_weight(15.0),
                Criterion::new("Tự tin và tương tác", "Thái độ tự tin, giao tiếp bằng mắt, phản hồi tốt.", 0.0, 10.0).with_weight(15.0),
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
            lines.push("**Dẫn chứng trong video:**".to_string());
            for ev in &s.evidence {
                lines.push(format!(
                    "- `{}` — {} _({})_",
                    ev.timestamp, ev.quote, ev.note
                ));
            }
            lines.push(String::new());
        }
    }

    lines.join("\n")
}
