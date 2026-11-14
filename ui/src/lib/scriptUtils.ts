import type { TranscriptResult, TranscriptSegment } from "./types";

export type SubtitleFontName = "Be Vietnam Pro" | "Noto Sans" | "Lexend";

export const INTERACTION_MODE_OPTIONS = [
  { value: "auto", label: "Tự nhận diện từ âm thanh" },
  { value: "interview", label: "Hỏi – Đáp (Giáo viên & Học sinh)" },
  { value: "monologue", label: "Thuyết trình / Độc thoại (1 Học sinh)" },
  { value: "pair", label: "Hội thoại theo cặp (2 Học sinh)" },
  { value: "group", label: "Thảo luận nhóm (3+ người)" },
];

export const VERBATIM_MODE_OPTIONS = [
  {
    value: "verbatim",
    label: "Nguyên trạng — Giữ cả lỗi ngữ pháp/ngập ngừng của HS",
  },
  {
    value: "clean",
    label: "Làm sạch — Lược bỏ từ đệm (um, uh) cho dễ đọc",
  },
];

export const SUBTITLE_FONT_OPTIONS: {
  value: SubtitleFontName;
  label: string;
  description: string;
}[] = [
  {
    value: "Be Vietnam Pro",
    label: "Be Vietnam Pro (Đẹp, hiện đại)",
    description: "Tối ưu dấu tiếng Việt & phụ đề",
  },
  {
    value: "Noto Sans",
    label: "Noto Sans (Đa ngôn ngữ, chuẩn)",
    description: "Hỗ trợ đa ngôn ngữ rộng",
  },
  {
    value: "Lexend",
    label: "Lexend (Dễ đọc, giảng dạy)",
    description: "Tăng độ dễ đọc cho học sinh",
  },
];

export function roleBadgeStyle(role: string): {
  label: string;
  badgeClass: string;
} {
  switch (role) {
    case "teacher":
      return {
        label: "Giáo viên",
        badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
      };
    case "student":
      return {
        label: "Học sinh",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    default:
      return {
        label: "Khác",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

export function formatPreviewSpeakerPrefix(
  seg: TranscriptSegment,
  showSpeaker: boolean,
  showRole: boolean
): string | null {
  if (!showSpeaker && !showRole) return null;
  const roleKey = seg.role.trim().toLowerCase();
  const roleVi = roleBadgeStyle(roleKey).label;
  const label = seg.speaker_label.trim() || roleVi;
  if (showSpeaker && showRole) {
    if (roleKey === "teacher") {
      const labelLower = label.toLowerCase();
      const roleLower = roleVi.toLowerCase();
      return labelLower === roleLower || labelLower.startsWith(roleLower)
        ? label
        : `${roleVi} - ${label}`;
    }
    return label;
  }
  return showSpeaker ? label : roleVi;
}

export function buildMarkdownScript(
  result: TranscriptResult,
  sourceName: string
): string {
  const lines: string[] = [
    `# Script bài nói: ${sourceName}`,
    "",
    `- **Ngôn ngữ chính:** ${result.detected_language}`,
  ];
  if (result.summary.trim()) {
    lines.push(`- **Tóm tắt bối cảnh:** ${result.summary.trim()}`);
  }
  if (result.speakers.length > 0) {
    const spList = result.speakers
      .map((s) => `${s.label} (${roleBadgeStyle(s.role).label})`)
      .join(", ");
    lines.push(`- **Người tham gia:** ${spList}`);
  }
  lines.push("", "## Nội dung chi tiết", "");
  for (const seg of result.segments) {
    const range = seg.end_time.trim()
      ? `${seg.start_time.trim()} - ${seg.end_time.trim()}`
      : seg.start_time.trim();
    const roleLabel = roleBadgeStyle(seg.role).label;
    lines.push(
      `- **[${range}] [${roleLabel}] ${seg.speaker_label}:** ${seg.text.trim()}`
    );
    if (seg.translation.trim()) {
      lines.push(`  - *Dịch:* ${seg.translation.trim()}`);
    }
    if (seg.grammar_note.trim()) {
      lines.push(`  - *Gợi ý sửa:* ${seg.grammar_note.trim()}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
