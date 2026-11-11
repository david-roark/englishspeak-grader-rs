use std::path::{Path, PathBuf};

use chrono::Local;
use rust_xlsxwriter::{Color, Format, FormatAlign, Workbook};

use crate::error::{GraderError, Result};
use crate::schemas::AssessmentResult;

fn bullets(items: &[String]) -> String {
    if items.is_empty() {
        String::new()
    } else {
        items
            .iter()
            .map(|x| format!("• {x}"))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// Tạo tên sheet an toàn cho Excel (<= 31 ký tự, loại bỏ `: \ / ? * [ ]`).
pub fn safe_sheet_title(name: &str, idx: usize) -> String {
    let bad = [':', '\\', '/', '?', '*', '[', ']'];
    let cleaned: String = name
        .chars()
        .filter(|ch| !bad.contains(ch))
        .collect::<String>()
        .trim()
        .to_string();
    let base = if cleaned.is_empty() {
        format!("HS {idx}")
    } else {
        cleaned
    };
    let prefix = format!("{idx}. ");
    let max_body = 31usize.saturating_sub(prefix.chars().count());
    let body: String = base.chars().take(max_body).collect();
    format!("{prefix}{body}")
}

/// Chuẩn hóa tên file an toàn (giữ ký tự chữ/số kể cả tiếng Việt có dấu, `-`, `_`).
pub fn slug(text: &str) -> String {
    let keep: String = text
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = keep.trim_matches('_');
    if trimmed.is_empty() {
        "ket_qua".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Tạo đường dẫn file mặc định trong `export_dir`.
pub fn default_export_path(export_dir: &Path, video_name: &str) -> PathBuf {
    let stamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let stem = Path::new(video_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("ket_qua");
    export_dir.join(format!("{}_{}.xlsx", slug(stem), stamp))
}

/// Xuất kết quả chấm điểm ra file Excel (`.xlsx`): sheet `Tổng quan` + mỗi học sinh 1 sheet chi tiết.
pub fn export_to_excel(
    result: &AssessmentResult,
    video_name: &str,
    rubric_name: &str,
    out_path: &Path,
) -> Result<PathBuf> {
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut wb = Workbook::new();

    let title_fmt = Format::new().set_bold().set_font_size(14);
    let bold_fmt = Format::new().set_bold();
    let header_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x2F5496));
    let wrap_fmt = Format::new().set_text_wrap().set_align(FormatAlign::Top);

    // -- Sheet 1: Tổng quan ------------------------------------------------ //
    {
        let ws = wb.add_worksheet();
        ws.set_name("Tổng quan")
            .map_err(|e| GraderError::Export(e.to_string()))?;

        ws.write_string_with_format(0, 0, "KẾT QUẢ CHẤM BÀI NÓI TIẾNG ANH", &title_fmt)
            .map_err(|e| GraderError::Export(e.to_string()))?;

        let now_str = Local::now().format("%d/%m/%Y %H:%M").to_string();
        let meta = [
            (2u32, "Video:", video_name),
            (3, "Rubric:", rubric_name),
            (4, "Ngày chấm:", now_str.as_str()),
            (5, "Ngôn ngữ nói:", result.detected_language.as_str()),
            (6, "Tóm tắt:", result.task_summary.as_str()),
        ];
        for (row, label, val) in meta {
            ws.write_string_with_format(row, 0, label, &bold_fmt)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            if row == 6 {
                ws.write_string_with_format(row, 1, val, &wrap_fmt)
                    .map_err(|e| GraderError::Export(e.to_string()))?;
            } else {
                ws.write_string(row, 1, val)
                    .map_err(|e| GraderError::Export(e.to_string()))?;
            }
        }

        // Bảng tổng điểm các học sinh (header ở dòng index 8 = row 9 trong Excel)
        let header_row = 8u32;
        let headers = [
            "Học sinh",
            "Tổng điểm",
            "Điểm tối đa",
            "Xếp loại",
            "Tên chắc chắn?",
        ];
        for (col, h) in headers.iter().enumerate() {
            ws.write_string_with_format(header_row, col as u16, *h, &header_fmt)
                .map_err(|e| GraderError::Export(e.to_string()))?;
        }

        for (idx, s) in result.students.iter().enumerate() {
            let r = header_row + 1 + idx as u32;
            ws.write_string(r, 0, &s.student_name)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            ws.write_number(r, 1, s.total_score)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            ws.write_number(r, 2, s.max_total_score)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            ws.write_string(r, 3, &s.overall_level)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            ws.write_string(
                r,
                4,
                if s.name_confident {
                    "Có"
                } else {
                    "Chưa (cần gán)"
                },
            )
            .map_err(|e| GraderError::Export(e.to_string()))?;
        }

        ws.set_column_width(0, 22)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        ws.set_column_width(1, 40)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        ws.set_column_width(2, 14)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        ws.set_column_width(3, 18)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        ws.set_column_width(4, 18)
            .map_err(|e| GraderError::Export(e.to_string()))?;
    }

    // -- Sheet 2..N: Mỗi học sinh 1 sheet chi tiết -------------------------- //
    for (idx, s) in result.students.iter().enumerate() {
        let title = safe_sheet_title(&s.student_name, idx + 1);
        let d = wb.add_worksheet();
        d.set_name(&title)
            .map_err(|e| GraderError::Export(e.to_string()))?;

        d.write_string_with_format(0, 0, &s.student_name, &title_fmt)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        d.write_string(
            1,
            0,
            format!(
                "Xếp loại: {}   |   Tổng: {}/{}",
                s.overall_level, s.total_score, s.max_total_score
            ),
        )
        .map_err(|e| GraderError::Export(e.to_string()))?;

        let mut r = 3u32;
        for (col, h) in ["Tiêu chí", "Điểm", "Tối đa", "Nhận xét"]
            .iter()
            .enumerate()
        {
            d.write_string_with_format(r, col as u16, *h, &header_fmt)
                .map_err(|e| GraderError::Export(e.to_string()))?;
        }
        for cs in &s.criteria {
            r += 1;
            d.write_string(r, 0, &cs.criterion)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            d.write_number(r, 1, cs.score)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            d.write_number(r, 2, cs.max_score)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            d.write_string_with_format(r, 3, &cs.comment, &wrap_fmt)
                .map_err(|e| GraderError::Export(e.to_string()))?;
        }

        r += 2;
        for (label, items) in [
            ("Điểm mạnh", &s.strengths),
            ("Điểm yếu", &s.weaknesses),
            ("Gợi ý cải thiện", &s.improvement_suggestions),
            ("Hướng luyện tập", &s.practice_directions),
        ] {
            d.write_string_with_format(r, 0, label, &bold_fmt)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            d.write_string_with_format(r, 1, bullets(items), &wrap_fmt)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            r += 1;
        }

        if !s.evidence.is_empty() {
            r += 1;
            d.write_string_with_format(r, 0, "Dẫn chứng (timestamp)", &bold_fmt)
                .map_err(|e| GraderError::Export(e.to_string()))?;
            r += 1;
            for (col, h) in ["Thời điểm", "Trích dẫn", "Ghi chú"].iter().enumerate() {
                d.write_string_with_format(r, col as u16, *h, &header_fmt)
                    .map_err(|e| GraderError::Export(e.to_string()))?;
            }
            for ev in &s.evidence {
                r += 1;
                d.write_string(r, 0, &ev.timestamp)
                    .map_err(|e| GraderError::Export(e.to_string()))?;
                d.write_string_with_format(r, 1, &ev.quote, &wrap_fmt)
                    .map_err(|e| GraderError::Export(e.to_string()))?;
                d.write_string_with_format(r, 2, &ev.note, &wrap_fmt)
                    .map_err(|e| GraderError::Export(e.to_string()))?;
            }
        }

        d.set_column_width(0, 26)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        d.set_column_width(1, 20)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        d.set_column_width(2, 12)
            .map_err(|e| GraderError::Export(e.to_string()))?;
        d.set_column_width(3, 50)
            .map_err(|e| GraderError::Export(e.to_string()))?;
    }

    wb.save(out_path)
        .map_err(|e| GraderError::Export(e.to_string()))?;
    Ok(out_path.to_path_buf())
}
