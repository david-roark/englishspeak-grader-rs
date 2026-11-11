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

/// Generate a clean, inline JSON Schema compatible with Gemini `responseJsonSchema`.
///
/// Strips `$schema`, `title`, `definitions`/`$defs`, `format`, and `default`,
/// and expands all `$ref` references inline so Gemini accepts it reliably.
pub fn assessment_result_gemini_schema() -> Value {
    let root = schemars::schema_for!(AssessmentResult);
    let raw = serde_json::to_value(&root).unwrap_or(Value::Null);
    let defs = raw
        .get("definitions")
        .or_else(|| raw.get("$defs"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    inline_and_clean_schema(&raw, &defs)
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
