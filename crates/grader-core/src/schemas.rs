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

fn format_ass_timestamp(secs: f64) -> String {
    let total_cs = (secs.max(0.0) * 100.0).round() as u64;
    let cs = total_cs % 100;
    let total_s = total_cs / 100;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    format!("{h}:{m:02}:{s:02}.{cs:02}")
}

fn segment_time_bounds(idx: usize, seg: &TranscriptSegment) -> (f64, f64) {
    let start_secs = parse_timecode_secs(&seg.start_time).unwrap_or((idx as f64) * 3.0);
    let end_secs = match parse_timecode_secs(&seg.end_time) {
        Some(e) if e > start_secs => e,
        _ => start_secs + 3.0,
    };
    (start_secs, end_secs)
}

fn subtitle_content_flags(content_mode: &str) -> (bool, bool) {
    match content_mode.trim().to_ascii_lowercase().as_str() {
        "text_only" => (false, false),
        "bilingual" => (true, false),
        "with_grammar" => (false, true),
        _ => (true, true),
    }
}

fn effective_segment_label(seg: &TranscriptSegment) -> &str {
    let trimmed = seg.speaker_label.trim();
    if trimmed.is_empty() {
        role_display_vi(&seg.role)
    } else {
        trimmed
    }
}

/// Xuất script sang định dạng phụ đề chuẩn SubRip (`.srt`).
pub fn format_transcript_srt(result: &TranscriptResult) -> String {
    format_transcript_srt_with_mode(result, "bilingual")
}

/// Xuất script sang `.srt` theo chế độ nội dung (`text_only`, `bilingual`, `with_grammar`, `all`).
pub fn format_transcript_srt_with_mode(result: &TranscriptResult, content_mode: &str) -> String {
    let (include_translation, include_grammar) = subtitle_content_flags(content_mode);
    let mut blocks = Vec::new();
    for (idx, seg) in result.segments.iter().enumerate() {
        let (start_secs, end_secs) = segment_time_bounds(idx, seg);
        let label = effective_segment_label(seg);

        let mut content = format!("[{label}]: {}", seg.text.trim());
        if include_translation && !seg.translation.trim().is_empty() {
            content.push('\n');
            content.push_str(seg.translation.trim());
        }
        if include_grammar && !seg.grammar_note.trim().is_empty() {
            content.push('\n');
            content.push_str("💡 Sửa: ");
            content.push_str(seg.grammar_note.trim());
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

fn is_emoji_or_icon_char(ch: char) -> bool {
    let cp = ch as u32;
    matches!(
        cp,
        0x2300..=0x23FF // Miscellaneous Technical (e.g. ⏰, ⏱)
            | 0x2600..=0x27BF // Misc Symbols & Dingbats (e.g. ⚠️, ✅, ✨, ⭐)
            | 0x2B00..=0x2BFF // Misc Symbols and Arrows
            | 0x1F300..=0x1FAFF // Emoji blocks (🎓, 💡, 🎤, 💬, 🌐, etc.)
    )
}

fn escape_ass_text(raw: &str) -> String {
    let sanitized = raw
        .trim()
        .replace('{', "(")
        .replace('}', ")")
        .replace("\r\n", "\n")
        .replace('\r', "\n");

    let mut out = String::with_capacity(sanitized.len() + 16);
    let mut in_emoji_run = false;

    for ch in sanitized.chars() {
        // Strip variation selectors so libass does not render missing-glyph tofu boxes.
        if matches!(ch, '\u{FE0E}' | '\u{FE0F}') {
            continue;
        }
        if ch == '\n' {
            if in_emoji_run {
                out.push_str(r"{\fn}");
                in_emoji_run = false;
            }
            out.push_str("\\N");
            continue;
        }

        if is_emoji_or_icon_char(ch) {
            if !in_emoji_run {
                out.push_str(r"{\fnNoto Emoji}");
                in_emoji_run = true;
            }
            out.push(ch);
        } else {
            if in_emoji_run {
                out.push_str(r"{\fn}");
                in_emoji_run = false;
            }
            out.push(ch);
        }
    }

    if in_emoji_run {
        out.push_str(r"{\fn}");
    }
    out
}

/// Tùy chọn định dạng phụ đề ASS (font chữ, chế độ nội dung và khung hình tham chiếu).
#[derive(Debug, Clone)]
pub struct AssSubtitleOptions {
    pub content_mode: String,
    pub font_name: String,
    pub play_res_x: u32,
    pub play_res_y: u32,
}

impl Default for AssSubtitleOptions {
    fn default() -> Self {
        Self {
            content_mode: "all".to_string(),
            font_name: "Be Vietnam Pro".to_string(),
            play_res_x: 1280,
            play_res_y: 720,
        }
    }
}

/// Xuất script sang định dạng ASS (`.ass`) với font, kích thước khung hình và màu vai trò tùy chỉnh.
pub fn format_transcript_ass_with_options(
    result: &TranscriptResult,
    opts: &AssSubtitleOptions,
) -> String {
    let (include_translation, include_grammar) = subtitle_content_flags(&opts.content_mode);
    let play_res_x = opts.play_res_x.max(320);
    let play_res_y = opts.play_res_y.max(320);
    let clean_font: String = opts
        .font_name
        .trim()
        .chars()
        .filter(|c| !matches!(c, ',' | '\r' | '\n' | '{' | '}'))
        .collect();
    let font_name = if clean_font.is_empty() {
        "Be Vietnam Pro".to_string()
    } else {
        clean_font
    };

    let (primary_fs, margin_h, margin_v) = if play_res_y > play_res_x {
        // Portrait video (e.g. 720x1280): keep text compact so lines do not wrap excessively.
        let pfs = ((play_res_x as f64) * 34.0 / 720.0)
            .round()
            .clamp(24.0, 52.0) as u32;
        let mh = ((play_res_x as f64) * 32.0 / 720.0).round().max(20.0) as u32;
        let mv = ((play_res_y as f64) * 48.0 / 1280.0).round().max(24.0) as u32;
        (pfs, mh, mv)
    } else {
        let pfs = ((play_res_y as f64) * 28.0 / 720.0)
            .round()
            .clamp(22.0, 52.0) as u32;
        let mh = ((play_res_x as f64) * 36.0 / 1280.0).round().max(20.0) as u32;
        let mv = ((play_res_y as f64) * 32.0 / 720.0).round().max(20.0) as u32;
        (pfs, mh, mv)
    };
    let secondary_fs = ((primary_fs as f64) * 23.0 / 28.0).round().max(18.0) as u32;

    let mut lines = vec![
        "[Script Info]".to_string(),
        "ScriptType: v4.00+".to_string(),
        format!("PlayResX: {play_res_x}"),
        format!("PlayResY: {play_res_y}"),
        "WrapStyle: 0".to_string(),
        "ScaledBorderAndShadow: yes".to_string(),
        String::new(),
        "[V4+ Styles]".to_string(),
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding".to_string(),
        format!(
            "Style: Default,{font_name},{primary_fs},&H00FFFFFF,&H000000FF,&H00121212,&H78000000,0,0,0,0,100,100,0,0,1,2.4,1.2,2,{margin_h},{margin_h},{margin_v},1"
        ),
        String::new(),
        "[Events]".to_string(),
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text".to_string(),
    ];

    for (idx, seg) in result.segments.iter().enumerate() {
        let (start_secs, end_secs) = segment_time_bounds(idx, seg);
        let label = escape_ass_text(effective_segment_label(seg));
        let speaker_tag = match seg.role.trim().to_ascii_lowercase().as_str() {
            "teacher" => format!("{{\\b1\\c&H00D4FF&}}[Giáo viên - {label}]:{{\\b0\\c&HFFFFFF&}}"),
            "student" => format!("{{\\b1\\c&H80FF80&}}[{label}]:{{\\b0\\c&HFFFFFF&}}"),
            _ => format!("{{\\b1\\c&HFFCC80&}}[{label}]:{{\\b0\\c&HFFFFFF&}}"),
        };

        let mut dialogue_text = format!("{speaker_tag} {}", escape_ass_text(&seg.text));
        if include_translation && !seg.translation.trim().is_empty() {
            dialogue_text.push_str(&format!(
                "\\N{{\\fs{secondary_fs}\\c&HE8E8E8&}}Dịch: {}",
                escape_ass_text(&seg.translation)
            ));
        }
        if include_grammar && !seg.grammar_note.trim().is_empty() {
            dialogue_text.push_str(&format!(
                "\\N{{\\fs{secondary_fs}\\c&H80D8FF&}}Sửa: {}",
                escape_ass_text(&seg.grammar_note)
            ));
        }

        lines.push(format!(
            "Dialogue: 0,{},{},Default,,0,0,0,,{}",
            format_ass_timestamp(start_secs),
            format_ass_timestamp(end_secs),
            dialogue_text
        ));
    }

    lines.join("\n") + "\n"
}

/// Xuất script sang định dạng ASS (`.ass`) có tô màu vai trò Giáo viên / Học sinh để đốt lên video.
pub fn format_transcript_ass(result: &TranscriptResult, content_mode: &str) -> String {
    format_transcript_ass_with_options(
        result,
        &AssSubtitleOptions {
            content_mode: content_mode.to_string(),
            ..Default::default()
        },
    )
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
