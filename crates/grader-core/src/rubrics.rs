use std::path::Path;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

use crate::error::{GraderError, Result};
use crate::schemas::{AssessmentResult, CriterionScore};

pub const MAX_ASSIGNMENT_IMAGE_BYTES: u64 = 15 * 1024 * 1024;

pub fn default_weight() -> f64 {
    1.0
}

pub fn default_scoring_mode() -> String {
    "sum".to_string()
}

pub fn default_assignment_mode() -> String {
    "flexible".to_string()
}

pub fn default_assignment_max_score() -> f64 {
    10.0
}

pub fn default_assignment_rounding() -> Option<f64> {
    Some(0.5)
}

pub fn default_assignment_task_type() -> String {
    "presentation".to_string()
}

pub fn default_assignment_feedback_lang() -> String {
    "vi".to_string()
}

/// Mã hóa dữ liệu nhị phân sang chuỗi Base64 chuẩn RFC 4648.
pub fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[(triple >> 18) & 0x3f] as char);
        out.push(TABLE[(triple >> 12) & 0x3f] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(triple >> 6) & 0x3f] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[triple & 0x3f] as char
        } else {
            '='
        });
    }
    out
}

/// Xác định MIME type từ phần mở rộng của file ảnh đề bài.
pub fn detect_image_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("webp") => Some("image/webp"),
        Some("gif") => Some("image/gif"),
        Some("bmp") => Some("image/bmp"),
        Some("heic") => Some("image/heic"),
        Some("heif") => Some("image/heif"),
        _ => None,
    }
}

/// Hình ảnh đề bài / slide / tranh tình huống đính kèm khi chấm bài.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssignmentImage {
    pub name: String,
    pub mime_type: String,
    pub data_base64: String,
}

impl AssignmentImage {
    /// Đọc file ảnh từ đĩa, kiểm tra định dạng và giới hạn <= 15 MB rồi mã hóa Base64.
    pub fn from_file(path: &Path) -> Result<Self> {
        if !path.is_file() {
            return Err(GraderError::InvalidInput(format!(
                "Không tìm thấy file ảnh: {}",
                path.display()
            )));
        }
        let mime_type = detect_image_mime(path).ok_or_else(|| {
            GraderError::InvalidInput(format!(
                "Định dạng ảnh chưa được hỗ trợ (hỗ trợ PNG, JPG, WEBP, GIF, BMP, HEIC): {}",
                path.display()
            ))
        })?;
        let meta = std::fs::metadata(path)?;
        if meta.len() > MAX_ASSIGNMENT_IMAGE_BYTES {
            return Err(GraderError::InvalidInput(format!(
                "Ảnh '{}' quá lớn ({:.1} MB). Giới hạn tối đa mỗi ảnh là 15 MB.",
                path.display(),
                meta.len() as f64 / (1024.0 * 1024.0)
            )));
        }
        let bytes = std::fs::read(path)?;
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("de_bai.png")
            .to_string();
        Ok(Self {
            name,
            mime_type: mime_type.to_string(),
            data_base64: encode_base64(&bytes),
        })
    }
}

/// Một Đề bài / Đợt chấm lưu sẵn để giáo viên tái sử dụng cho nhiều video.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GradingAssignment {
    pub id: String,
    pub name: String,
    #[serde(default = "default_assignment_mode")]
    pub mode: String, // "flexible" | "rubric"
    #[serde(default)]
    pub rubric_id: Option<String>,
    #[serde(default = "default_assignment_max_score")]
    pub max_score: f64,
    #[serde(default = "default_assignment_rounding")]
    pub rounding_step: Option<f64>,
    #[serde(default)]
    pub requirements: String,
    #[serde(default = "default_assignment_task_type")]
    pub task_type: String,
    #[serde(default = "default_assignment_feedback_lang")]
    pub feedback_lang: String,
    #[serde(default)]
    pub prompt_profile_id: Option<String>,
    #[serde(default)]
    pub images: Vec<AssignmentImage>,
    #[serde(default)]
    pub updated_at: String,
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
    /// Tạo Rubric linh hoạt (ephemeral) từ mô tả yêu cầu tự nhiên & thang điểm của giáo viên.
    pub fn flexible(
        name: impl Into<String>,
        requirements: impl Into<String>,
        max_score: f64,
        rounding_step: Option<f64>,
    ) -> Self {
        let name_str = name.into();
        let clean_name = if name_str.trim().is_empty() {
            "Chấm linh hoạt theo Đề bài".to_string()
        } else {
            name_str.trim().to_string()
        };
        let valid_max = if max_score.is_finite() && max_score > 0.0 {
            max_score
        } else {
            10.0
        };
        let valid_round = rounding_step.filter(|s| s.is_finite() && *s > 0.0);
        Self {
            id: "flexible_assignment".to_string(),
            name: clean_name,
            description: requirements.into(),
            scale_note: format!(
                "Chấm linh hoạt theo yêu cầu đề bài, thang điểm tối đa {}",
                fmt_num(valid_max)
            ),
            is_builtin: false,
            scoring_mode: "flexible".to_string(),
            target_scale: Some(valid_max),
            rounding_step: valid_round,
            criteria: Vec::new(),
        }
    }

    pub fn is_flexible(&self) -> bool {
        self.scoring_mode == "flexible" || self.criteria.is_empty()
    }

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
        if self.is_flexible() {
            let scale = self
                .target_scale
                .filter(|s| s.is_finite() && *s > 0.0)
                .unwrap_or(10.0);
            return round_to_step(scale, self.rounding_step);
        }

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

        if self.is_flexible() {
            let mut sum_score = 0.0;
            let mut sum_max = 0.0;
            for s in scores {
                let max_s = if s.max_score.is_finite() && s.max_score >= 0.0 {
                    s.max_score
                } else {
                    0.0
                };
                let sc = if s.score.is_finite() {
                    s.score.clamp(0.0, max_s)
                } else {
                    0.0
                };
                sum_score += sc;
                sum_max += max_s;
            }
            let raw = if (sum_max - max_total).abs() <= 1e-6 {
                sum_score
            } else if sum_max > 1e-6 {
                (sum_score / sum_max) * max_total
            } else {
                0.0
            };
            let rounded = round_to_step(raw, self.rounding_step).clamp(0.0, max_total);
            return (rounded, max_total);
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
        if self.is_flexible() {
            let max_total = self.max_total();
            for student in &mut result.students {
                for s in &mut student.criteria {
                    let max_s = if s.max_score.is_finite() && s.max_score >= 0.0 {
                        round_to_step(s.max_score, None)
                    } else {
                        0.0
                    };
                    let sc = if s.score.is_finite() {
                        round_to_step(s.score.clamp(0.0, max_s), None)
                    } else {
                        0.0
                    };
                    s.max_score = max_s;
                    s.score = sc;
                }
                if !student.criteria.is_empty() {
                    let (total, mt) = self.compute_total_score(&student.criteria);
                    student.total_score = total;
                    student.max_total_score = mt;
                } else {
                    let raw = if student.total_score.is_finite() {
                        student.total_score
                    } else {
                        0.0
                    };
                    student.total_score =
                        round_to_step(raw, self.rounding_step).clamp(0.0, max_total);
                    student.max_total_score = max_total;
                }
            }
            return;
        }

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
        if self.is_flexible() {
            format!(
                "Chấm linh hoạt theo đề bài trên thang {}{}",
                fmt_num(self.max_total()),
                round_part
            )
        } else if self.is_weighted_avg() {
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
        if self.is_flexible() {
            let max_tot = fmt_num(self.max_total());
            let mut lines = vec![
                format!("CHẾ ĐỘ CHẤM LINH HOẠT THEO ĐỀ BÀI: {}", self.name),
                format!(
                    "Thang điểm tổng tối đa: {max_tot} điểm ({})",
                    self.scoring_formula_summary()
                ),
            ];
            if !self.description.trim().is_empty() {
                lines.push("YÊU CẦU & NỘI DUNG ĐỀ BÀI CỦA GIÁO VIÊN:".to_string());
                lines.push(self.description.trim().to_string());
            }
            lines.push("HƯỚNG DẪN TÁCH TIÊU CHÍ & CHẤM ĐIỂM:".to_string());
            lines.push("- Nếu giáo viên đã nêu rõ các đầu mục chấm và thang điểm thành phần trong yêu cầu (hoặc trong ảnh đề), hãy tách ĐÚNG các đầu mục đó vào mảng `criteria` với `max_score` tương ứng.".to_string());
            lines.push(format!("- Nếu giáo viên chỉ nêu yêu cầu tổng quát mà chưa chia nhỏ điểm, hãy tự chia thành 3–4 tiêu chí đánh giá hợp lý bám sát đúng yêu cầu đề bài (ví dụ: Đáp ứng nội dung đề bài, Phát âm & Độ trôi chảy, Từ vựng & Ngữ pháp...) sao cho tổng `max_score` của các tiêu chí bằng đúng {max_tot}."));
            lines.push(format!("- Đảm bảo tổng điểm các tiêu chí (`total_score`) khớp với quy tắc làm tròn và không vượt quá {max_tot}."));
            return lines.join("\n");
        }

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
