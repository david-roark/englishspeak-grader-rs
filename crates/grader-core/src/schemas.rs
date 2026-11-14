use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Điểm cho một tiêu chí trong rubric.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct CriterionScore {
    /// Tên tiêu chí, đúng như trong rubric.
    pub criterion: String,
    /// Điểm số đạt được cho tiêu chí này.
    pub score: f64,
    /// Điểm tối đa của tiêu chí này.
    pub max_score: f64,
    /// Nhận xét ngắn gọn lý do cho điểm này.
    pub comment: String,
}

/// Dẫn chứng cụ thể trích từ video kèm mốc thời gian.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Evidence {
    /// Mốc thời gian trong video, định dạng MM:SS hoặc HH:MM:SS.
    pub timestamp: String,
    /// Trích dẫn hoặc mô tả điều học sinh nói/làm.
    pub quote: String,
    /// Vì sao dẫn chứng này đáng chú ý (tốt hoặc cần sửa).
    pub note: String,
}

/// Kết quả đánh giá cho MỘT học sinh.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct StudentAssessment {
    /// Tên học sinh nếu nghe được trong phần tự giới thiệu.
    /// Nếu không xác định được tên, dùng nhãn như 'Học sinh 1', 'Học sinh 2'.
    pub student_name: String,
    /// True nếu tên lấy trực tiếp từ lời giới thiệu trong video; False nếu chỉ là nhãn tạm.
    pub name_confident: bool,
    /// Điểm theo từng tiêu chí của rubric.
    pub criteria: Vec<CriterionScore>,
    /// Tổng điểm.
    pub total_score: f64,
    /// Tổng điểm tối đa có thể đạt.
    pub max_total_score: f64,
    /// Xếp loại/mức tổng quát (vd: band 6.5, mức B1, Khá...) phù hợp rubric.
    pub overall_level: String,
    /// Danh sách điểm mạnh.
    pub strengths: Vec<String>,
    /// Danh sách điểm yếu.
    pub weaknesses: Vec<String>,
    /// Gợi ý cải thiện cụ thể, khả thi.
    pub improvement_suggestions: Vec<String>,
    /// Hướng luyện tập/bài tập gợi ý để tiến bộ.
    pub practice_directions: Vec<String>,
    /// Các dẫn chứng kèm timestamp minh hoạ cho nhận xét.
    #[serde(default)]
    pub evidence: Vec<Evidence>,
}

/// Kết quả chấm cho toàn bộ video (có thể gồm nhiều học sinh).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct AssessmentResult {
    /// Tóm tắt ngắn nội dung/bối cảnh bài nói trong video.
    pub task_summary: String,
    /// Ngôn ngữ chính học sinh sử dụng trong video (vd: English).
    pub detected_language: String,
    /// Danh sách kết quả đánh giá cho từng học sinh.
    pub students: Vec<StudentAssessment>,
    /// Ghi chú chung của giám khảo về cả buổi (nếu có).
    #[serde(default)]
    pub general_notes: String,
}

/// Thông tin một người nói được nhận diện trong file media.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TranscriptSpeaker {
    /// Mã định danh ngắn gọn (vd: "T1", "S1", "S2").
    pub id: String,
    /// Tên hoặc nhãn hiển thị (vd: "Cô Lan", "Minh", "Giáo viên", "Học sinh 1").
    pub label: String,
    /// Vai trò: "teacher", "student", hoặc "other".
    pub role: String,
    /// True nếu nghe rõ tên thật trong audio; False nếu là nhãn tạm.
    #[serde(default)]
    pub name_confident: bool,
}

/// Một lượt thoại kèm mốc thời gian trong script.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TranscriptSegment {
    /// Mốc bắt đầu, định dạng MM:SS hoặc HH:MM:SS.
    pub start_time: String,
    /// Mốc kết thúc, định dạng MM:SS hoặc HH:MM:SS.
    #[serde(default)]
    pub end_time: String,
    /// Khớp với `TranscriptSpeaker.id`.
    pub speaker_id: String,
    /// Tên hoặc nhãn người nói của lượt thoại này.
    pub speaker_label: String,
    /// Vai trò: "teacher", "student", hoặc "other".
    pub role: String,
    /// Nội dung lời nói đã chép.
    pub text: String,
    /// Bản dịch tiếng Việt ngắn gọn (nếu bật tùy chọn dịch).
    #[serde(default)]
    pub translation: String,
    /// Ghi chú lỗi ngữ pháp/từ vựng và câu gợi ý tự nhiên hơn (nếu có).
    #[serde(default)]
    pub grammar_note: String,
}

/// Kết quả tạo script hội thoại/bài nói từ video/audio.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TranscriptResult {
    /// Tóm tắt ngắn bối cảnh cuộc hội thoại / bài nói.
    pub summary: String,
    /// Ngôn ngữ chính nghe được (vd: English).
    pub detected_language: String,
    /// Danh sách người nói tham gia.
    pub speakers: Vec<TranscriptSpeaker>,
    /// Danh sách các lượt thoại theo đúng thứ tự thời gian.
    pub segments: Vec<TranscriptSegment>,
}

/// Generate a clean, inline JSON Schema compatible with Gemini `responseJsonSchema`.
///
/// Strips `$schema`, `title`, `definitions`/`$defs`, `format`, and `default`,
/// and expands all `$ref` references inline so Gemini accepts it reliably.
pub fn assessment_result_gemini_schema() -> Value {
    clean_gemini_schema(&schemars::schema_for!(AssessmentResult))
}

/// Generate a clean, inline JSON Schema for `TranscriptResult` compatible with Gemini `responseJsonSchema`.
pub fn transcript_result_gemini_schema() -> Value {
    clean_gemini_schema(&schemars::schema_for!(TranscriptResult))
}

fn clean_gemini_schema(root: &impl Serialize) -> Value {
    let raw = serde_json::to_value(root).unwrap_or(Value::Null);
    let defs = raw
        .get("definitions")
        .or_else(|| raw.get("$defs"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    inline_and_clean_schema(&raw, &defs)
}

fn role_display_vi(role: &str) -> &'static str {
    match role.trim().to_ascii_lowercase().as_str() {
        "teacher" => "Giáo viên",
        "student" => "Học sinh",
        _ => "Khác",
    }
}

/// Xuất script hội thoại ra định dạng Markdown rõ ràng kèm timestamp, vai trò, bản dịch và gợi ý sửa.
pub fn format_transcript_markdown(result: &TranscriptResult, source_name: &str) -> String {
    let mut lines = vec![
        format!("# Script bài nói: {source_name}"),
        String::new(),
        format!("- **Ngôn ngữ chính:** {}", result.detected_language.trim()),
    ];
    if !result.summary.trim().is_empty() {
        lines.push(format!("- **Tóm tắt bối cảnh:** {}", result.summary.trim()));
    }
    if !result.speakers.is_empty() {
        let speaker_list = result
            .speakers
            .iter()
            .map(|sp| format!("{} ({})", sp.label.trim(), role_display_vi(&sp.role)))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("- **Người tham gia:** {speaker_list}"));
    }
    lines.push(String::new());
    lines.push("## Nội dung chi tiết".to_string());
    lines.push(String::new());

    for seg in &result.segments {
        let time_range = if seg.end_time.trim().is_empty() {
            seg.start_time.trim().to_string()
        } else {
            format!("{} - {}", seg.start_time.trim(), seg.end_time.trim())
        };
        let role_vi = role_display_vi(&seg.role);
        let label = if seg.speaker_label.trim().is_empty() {
            role_vi
        } else {
            seg.speaker_label.trim()
        };
        lines.push(format!(
            "- **[{time_range}] [{role_vi}] {label}:** {}",
            seg.text.trim()
        ));
        if !seg.translation.trim().is_empty() {
            lines.push(format!("  - *Dịch:* {}", seg.translation.trim()));
        }
        if !seg.grammar_note.trim().is_empty() {
            lines.push(format!("  - *Gợi ý sửa:* {}", seg.grammar_note.trim()));
        }
    }

    lines.join("\n") + "\n"
}

/// Xuất script hội thoại ra văn bản thuần (`.txt`) dễ đọc.
pub fn format_transcript_text(result: &TranscriptResult, source_name: &str) -> String {
    let mut lines = vec![
        format!("SCRIPT BÀI NÓI: {source_name}"),
        format!("Ngôn ngữ: {}", result.detected_language.trim()),
    ];
    if !result.summary.trim().is_empty() {
        lines.push(format!("Tóm tắt: {}", result.summary.trim()));
    }
    if !result.speakers.is_empty() {
        let speaker_list = result
            .speakers
            .iter()
            .map(|sp| format!("{} ({})", sp.label.trim(), role_display_vi(&sp.role)))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("Người tham gia: {speaker_list}"));
    }
    lines.push(String::new());
    lines.push("----------------------------------------".to_string());
    lines.push(String::new());

    for seg in &result.segments {
        let time_range = if seg.end_time.trim().is_empty() {
            seg.start_time.trim().to_string()
        } else {
            format!("{} - {}", seg.start_time.trim(), seg.end_time.trim())
        };
        let role_vi = role_display_vi(&seg.role);
        let label = if seg.speaker_label.trim().is_empty() {
            role_vi
        } else {
            seg.speaker_label.trim()
        };
        lines.push(format!(
            "[{time_range}] [{role_vi}] {label}: {}",
            seg.text.trim()
        ));
        if !seg.translation.trim().is_empty() {
            lines.push(format!("  Dịch: {}", seg.translation.trim()));
        }
        if !seg.grammar_note.trim().is_empty() {
            lines.push(format!("  Gợi ý sửa: {}", seg.grammar_note.trim()));
        }
    }

    lines.join("\n") + "\n"
}

fn parse_timecode_secs(tc: &str) -> Option<f64> {
    let clean = tc.trim().trim_start_matches('[').trim_end_matches(']');
    if clean.is_empty() {
        return None;
    }
    let parts: Vec<&str> = clean.split(':').collect();
    match parts.len() {
        1 => parts[0].parse::<f64>().ok().filter(|&v| v >= 0.0),
        2 => {
            let m: f64 = parts[0].parse().ok()?;
            let s: f64 = parts[1].parse().ok()?;
            Some((m * 60.0 + s).max(0.0))
        }
        3 => {
            let h: f64 = parts[0].parse().ok()?;
            let m: f64 = parts[1].parse().ok()?;
            let s: f64 = parts[2].parse().ok()?;
            Some((h * 3600.0 + m * 60.0 + s).max(0.0))
        }
        _ => None,
    }
}

fn format_srt_timestamp(secs: f64) -> String {
    let total_ms = (secs.max(0.0) * 1000.0).round() as u64;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

/// Xuất script sang định dạng phụ đề chuẩn SubRip (`.srt`).
pub fn format_transcript_srt(result: &TranscriptResult) -> String {
    let mut blocks = Vec::new();
    for (idx, seg) in result.segments.iter().enumerate() {
        let start_secs = parse_timecode_secs(&seg.start_time).unwrap_or((idx as f64) * 3.0);
        let parsed_end = parse_timecode_secs(&seg.end_time);
        let end_secs = match parsed_end {
            Some(e) if e > start_secs => e,
            _ => start_secs + 3.0,
        };

        let label = if seg.speaker_label.trim().is_empty() {
            role_display_vi(&seg.role)
        } else {
            seg.speaker_label.trim()
        };

        let mut content = format!("[{label}]: {}", seg.text.trim());
        if !seg.translation.trim().is_empty() {
            content.push('\n');
            content.push_str(seg.translation.trim());
        }

        blocks.push(format!(
            "{}\n{} --> {}\n{}",
            idx + 1,
            format_srt_timestamp(start_secs),
            format_srt_timestamp(end_secs),
            content
        ));
    }
    if blocks.is_empty() {
        String::new()
    } else {
        blocks.join("\n\n") + "\n"
    }
}

fn inline_and_clean_schema(node: &Value, defs: &Map<String, Value>) -> Value {
    match node {
        Value::Object(map) => {
            if let Some(ref_str) = map.get("$ref").and_then(Value::as_str) {
                let def_name = ref_str.rsplit('/').next().unwrap_or(ref_str);
                if let Some(target) = defs.get(def_name) {
                    let mut resolved = inline_and_clean_schema(target, defs);
                    if let (Value::Object(resolved_map), Some(desc)) =
                        (&mut resolved, map.get("description"))
                    {
                        resolved_map
                            .entry("description".to_string())
                            .or_insert_with(|| desc.clone());
                    }
                    return resolved;
                }
            }

            let mut out = Map::new();
            for (k, v) in map {
                if matches!(
                    k.as_str(),
                    "$schema" | "definitions" | "$defs" | "title" | "format" | "default"
                ) {
                    continue;
                }
                out.insert(k.clone(), inline_and_clean_schema(v, defs));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(
            arr.iter()
                .map(|v| inline_and_clean_schema(v, defs))
                .collect(),
        ),
        other => other.clone(),
    }
}
