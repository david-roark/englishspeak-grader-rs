use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::rubrics::Rubric;

pub fn default_temperature() -> f32 {
    0.25
}

pub fn default_strictness() -> String {
    "standard".to_string()
}

/// Cấu hình prompt chuẩn hóa, lưu trong SQLite (`prompt_profiles`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PromptProfile {
    pub id: String,
    pub name: String,
    pub system_instruction: String,
    pub names_with_list: String,
    pub names_auto_detect: String,
    pub grading_rules: Vec<String>,
    pub task_types: BTreeMap<String, String>,
    pub feedback_languages: BTreeMap<String, String>,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_strictness")]
    pub strictness: String,
}

/// Hai phần prompt thực tế gửi cho Gemini (`systemInstruction` và `contents` user part).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PromptParts {
    pub system_instruction: String,
    pub user_prompt: String,
}

impl Default for PromptProfile {
    fn default() -> Self {
        let mut task_types = BTreeMap::new();
        task_types.insert(
            "presentation".into(),
            "Bài thuyết trình cá nhân: một học sinh trình bày một chủ đề.".into(),
        );
        task_types.insert(
            "qa".into(),
            "Hỏi–đáp: giáo viên đặt câu hỏi, học sinh trả lời.".into(),
        );
        task_types.insert(
            "dialogue".into(),
            "Đối thoại: hai (hoặc nhiều) học sinh nói chuyện với nhau.".into(),
        );
        task_types.insert(
            "group".into(),
            "Thảo luận nhóm: nhiều học sinh cùng trao đổi.".into(),
        );
        task_types.insert("other".into(), "Bài nói tiếng Anh nói chung.".into());

        let mut feedback_languages = BTreeMap::new();
        feedback_languages.insert(
            "vi".into(),
            "Viết TẤT CẢ nhận xét, điểm mạnh, điểm yếu, gợi ý bằng TIẾNG VIỆT.".into(),
        );
        feedback_languages.insert(
            "en".into(),
            "Write ALL feedback, strengths, weaknesses, and suggestions in ENGLISH.".into(),
        );
        feedback_languages.insert(
            "bilingual".into(),
            "Viết nhận xét SONG NGỮ: mỗi mục ghi tiếng Việt trước, rồi tiếng Anh trong ngoặc. Ví dụ: 'Phát âm rõ ràng (Clear pronunciation)'.".into(),
        );

        Self {
            id: "default".into(),
            name: "Mặc định".into(),
            system_instruction: "Bạn là một giám khảo chấm thi nói tiếng Anh giàu kinh nghiệm, công tâm và chi tiết.\nNhiệm vụ: xem video học sinh nói tiếng Anh và chấm điểm theo rubric dưới đây.".into(),
            names_with_list: "Giáo viên cung cấp sẵn danh sách học sinh (theo thứ tự xuất hiện): {names}. Hãy gán kết quả theo đúng các tên này.".into(),
            names_auto_detect: "Giáo viên KHÔNG cung cấp tên. Hãy lắng nghe phần tự giới thiệu trong video để lấy tên học sinh (đặt name_confident=true). Nếu không nghe được tên, hãy đặt nhãn 'Học sinh 1', 'Học sinh 2'... theo thứ tự xuất hiện và đặt name_confident=false để giáo viên gán tên sau.".into(),
            grading_rules: vec![
                "Xem cả HÌNH ẢNH và ÂM THANH (phát âm, ngữ điệu, cử chỉ, sự tự tin).".into(),
                "Chấm điểm CHÍNH XÁC theo từng tiêu chí của rubric, không tự thêm/bớt tiêu chí.".into(),
                "Tính total_score và max_total_score KHỚP với quy tắc thang điểm của rubric (cộng tổng hay trung bình và bước làm tròn).".into(),
                "Chỉ nhận xét dựa trên phần nghe/nhìn thực tế trong video; nếu âm thanh ồn, quá nhỏ hoặc thời lượng nói quá ngắn (< 15 giây), hãy ghi rõ hạn chế trong general_notes và đặt name_confident=false khi chưa chắc danh tính.".into(),
                "Với mỗi học sinh: nêu điểm mạnh, điểm yếu, gợi ý cải thiện cụ thể và hướng luyện tập.".into(),
                "Đưa dẫn chứng kèm mốc thời gian (timestamp) cho các nhận xét.".into(),
                "Chấm công bằng theo trình độ; giải thích chi tiết lý do mỗi mức điểm.".into(),
                "NGÔN NGỮ NHẬN XÉT: {lang_instr}".into(),
                "Tên tiêu chí trong kết quả phải GIỮ NGUYÊN như trong rubric.".into(),
            ],
            task_types,
            feedback_languages,
            temperature: default_temperature(),
            strictness: default_strictness(),
        }
    }
}

/// Hợp nhất các key mới từ mặc định nếu profile cũ bị thiếu key.
pub fn merge_with_default(mut profile: PromptProfile) -> PromptProfile {
    let def = PromptProfile::default();
    if profile.system_instruction.trim().is_empty() {
        profile.system_instruction = def.system_instruction;
    }
    if profile.names_with_list.trim().is_empty() {
        profile.names_with_list = def.names_with_list;
    }
    if profile.names_auto_detect.trim().is_empty() {
        profile.names_auto_detect = def.names_auto_detect;
    }
    if profile.grading_rules.is_empty() {
        profile.grading_rules = def.grading_rules;
    }
    for (k, v) in def.task_types {
        profile.task_types.entry(k).or_insert(v);
    }
    for (k, v) in def.feedback_languages {
        profile.feedback_languages.entry(k).or_insert(v);
    }
    if !profile.temperature.is_finite() {
        profile.temperature = default_temperature();
    } else {
        profile.temperature = profile.temperature.clamp(0.0, 1.0);
    }
    if !matches!(
        profile.strictness.as_str(),
        "encouraging" | "standard" | "strict"
    ) {
        profile.strictness = default_strictness();
    }
    profile
}

fn strictness_instruction(strictness: &str) -> &'static str {
    match strictness {
        "encouraging" => {
            "Khuyến khích & sư phạm: ghi nhận nỗ lực giao tiếp, chấm nới tay nhẹ với lỗi nhỏ không làm mất nghĩa, ưu tiên gợi ý động viên dễ áp dụng."
        }
        "strict" => {
            "Khắt khe chuẩn thi cử: áp dụng đúng tiêu chuẩn học thuật/chứng chỉ, trừ điểm rõ ràng các lỗi phát âm sai hệ thống, lặp từ, ngắt quãng hoặc sai ngữ pháp."
        }
        _ => "Tiêu chuẩn & cân bằng: đánh giá khách quan, công bằng giữa độ trôi chảy, phát âm, từ vựng và ngữ pháp.",
    }
}

/// Tách prompt thành `systemInstruction` (gửi ở cấp hệ thống) và `user_prompt` (gửi cùng video).
pub fn build_prompt_parts(
    profile: &PromptProfile,
    rubric: &Rubric,
    task_type: &str,
    feedback_language: &str,
    student_names: Option<&[String]>,
    extra_instructions: &str,
) -> PromptParts {
    build_prompt_parts_with_images(
        profile,
        rubric,
        task_type,
        feedback_language,
        student_names,
        extra_instructions,
        0,
    )
}

/// Tách prompt thành `systemInstruction` và `user_prompt`, có hỗ trợ thông tin ảnh đề bài đính kèm.
pub fn build_prompt_parts_with_images(
    profile: &PromptProfile,
    rubric: &Rubric,
    task_type: &str,
    feedback_language: &str,
    student_names: Option<&[String]>,
    extra_instructions: &str,
    image_count: usize,
) -> PromptParts {
    let task_desc = profile
        .task_types
        .get(task_type)
        .or_else(|| profile.task_types.get("other"))
        .map(String::as_str)
        .unwrap_or("Bài nói tiếng Anh nói chung.");

    let lang_instr = profile
        .feedback_languages
        .get(feedback_language)
        .or_else(|| profile.feedback_languages.get("vi"))
        .map(String::as_str)
        .unwrap_or("Viết nhận xét bằng tiếng Việt.");

    let names_line = match student_names {
        Some(names) if !names.is_empty() => profile
            .names_with_list
            .replace("{names}", &names.join(", ")),
        _ => profile.names_auto_detect.clone(),
    };

    let is_flexible = rubric.is_flexible();

    let mut parts: Vec<String> = Vec::new();
    parts.push(format!("LOẠI BÀI: {task_desc}"));
    parts.push(format!(
        "MỨC ĐỘ KHẮT KHE: {}",
        strictness_instruction(&profile.strictness)
    ));
    parts.push(String::new());
    parts.push(rubric.to_prompt_block());

    if image_count > 0 {
        parts.push(String::new());
        parts.push(format!(
            "ẢNH ĐỀ BÀI / TÀI LIỆU ĐÍNH KÈM ({image_count} ảnh):"
        ));
        parts.push(format!(
            "- Giáo viên có đính kèm {image_count} hình ảnh đề bài / câu hỏi gợi ý / tranh tình huống."
        ));
        parts.push(
            "- Hãy quan sát kỹ nội dung chữ và hình trong các ảnh đề bài này để đối chiếu trực tiếp với phần trình bày của học sinh trong video (đúng chủ đề, trả lời đủ câu hỏi/ý gợi ý, mô tả đúng tranh, dùng đúng từ vựng/cấu trúc yêu cầu)."
                .to_string(),
        );
    }

    parts.push(String::new());
    parts.push("PHÂN BIỆT HỌC SINH:".to_string());
    parts.push(names_line);
    parts.push(String::new());
    parts.push("YÊU CẦU CHẤM:".to_string());

    let mut has_lang_instr = false;
    for rule in &profile.grading_rules {
        let mut line = if is_flexible && rule.contains("không tự thêm/bớt tiêu chí") {
            "Chấm điểm bám sát yêu cầu đề bài; tách các đầu mục vào `criteria` theo đúng đề bài hoặc chia 3–4 tiêu chí hợp lý.".to_string()
        } else if is_flexible && rule.contains("GIỮ NGUYÊN như trong rubric") {
            "Đặt tên các tiêu chí trong kết quả rõ ràng, khớp với các đầu mục yêu cầu của đề bài."
                .to_string()
        } else {
            rule.clone()
        };

        if line.contains("{lang_instr}") {
            line = line.replace("{lang_instr}", lang_instr);
            has_lang_instr = true;
        }
        if !line.starts_with('-') {
            line = format!("- {line}");
        }
        parts.push(line);
    }
    if !has_lang_instr {
        parts.push(format!("- NGÔN NGỮ NHẬN XÉT: {lang_instr}"));
    }

    let extra = extra_instructions.trim();
    if !extra.is_empty() {
        parts.push(String::new());
        parts.push("YÊU CẦU BỔ SUNG TỪ GIÁO VIÊN:".to_string());
        parts.push(extra.to_string());
    }

    parts.push(String::new());
    parts.push(
        "Trả về kết quả đúng theo cấu trúc JSON được yêu cầu (không thêm văn bản ngoài JSON)."
            .to_string(),
    );

    PromptParts {
        system_instruction: profile.system_instruction.trim().to_string(),
        user_prompt: parts.join("\n"),
    }
}

/// Dựng prompt gộp đầy đủ (hữu ích cho test hoặc hiển thị toàn văn).
pub fn build_grading_prompt(
    profile: &PromptProfile,
    rubric: &Rubric,
    task_type: &str,
    feedback_language: &str,
    student_names: Option<&[String]>,
    extra_instructions: &str,
) -> String {
    let parts = build_prompt_parts(
        profile,
        rubric,
        task_type,
        feedback_language,
        student_names,
        extra_instructions,
    );
    if parts.system_instruction.is_empty() {
        parts.user_prompt
    } else {
        format!("{}\n\n{}", parts.system_instruction, parts.user_prompt)
    }
}
