import { describe, expect, it } from "vitest";
import type { TranscriptResult, TranscriptSegment } from "./types";
import {
  buildMarkdownScript,
  formatPreviewSpeakerPrefix,
  roleBadgeStyle,
} from "./scriptUtils";

const SAMPLE_SEG: TranscriptSegment = {
  start_time: "00:01",
  end_time: "00:05",
  speaker_id: "T1",
  speaker_label: "Ms. Lan",
  role: "teacher",
  text: "Hello everyone!",
  translation: "Xin chào cả lớp!",
  grammar_note: "",
};

describe("scriptUtils", () => {
  it("maps speaker roles to Vietnamese labels and badge styles", () => {
    expect(roleBadgeStyle("teacher").label).toBe("Giáo viên");
    expect(roleBadgeStyle("student").label).toBe("Học sinh");
    expect(roleBadgeStyle("other").label).toBe("Khác");
  });

  it("formats preview speaker prefix according to visibility flags", () => {
    expect(formatPreviewSpeakerPrefix(SAMPLE_SEG, true, true)).toBe(
      "Giáo viên - Ms. Lan"
    );
    expect(formatPreviewSpeakerPrefix(SAMPLE_SEG, true, false)).toBe("Ms. Lan");
    expect(formatPreviewSpeakerPrefix(SAMPLE_SEG, false, true)).toBe(
      "Giáo viên"
    );
    expect(formatPreviewSpeakerPrefix(SAMPLE_SEG, false, false)).toBeNull();

    // Avoids duplicating "Giáo viên - Giáo viên"
    expect(
      formatPreviewSpeakerPrefix(
        { ...SAMPLE_SEG, speaker_label: "Giáo viên" },
        true,
        true
      )
    ).toBe("Giáo viên");
  });

  it("builds markdown script with metadata, segments, translation, and grammar note", () => {
    const result: TranscriptResult = {
      summary: "Luyện nói ngắn",
      detected_language: "English",
      speakers: [
        { id: "T1", label: "Ms. Lan", role: "teacher", name_confident: true },
      ],
      segments: [
        { ...SAMPLE_SEG, grammar_note: "Use clear intonation" },
      ],
    };
    const md = buildMarkdownScript(result, "lesson1.mp4");
    expect(md).toContain("# Script bài nói: lesson1.mp4");
    expect(md).toContain("**Ngôn ngữ chính:** English");
    expect(md).toContain("**[00:01 - 00:05] [Giáo viên] Ms. Lan:** Hello everyone!");
    expect(md).toContain("*Dịch:* Xin chào cả lớp!");
    expect(md).toContain("*Gợi ý sửa:* Use clear intonation");
  });
});
