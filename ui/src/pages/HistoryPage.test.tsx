import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AssessmentDetail, AssessmentSummary, FileInfo } from "../lib/types";

const {
  listAssessmentsMock,
  getAssessmentMock,
  inspectFileMock,
  mediaUrlMock,
} = vi.hoisted(() => ({
  listAssessmentsMock: vi.fn<() => Promise<AssessmentSummary[]>>(),
  getAssessmentMock: vi.fn<(id: number) => Promise<AssessmentDetail | null>>(),
  inspectFileMock: vi.fn<(path: string) => Promise<FileInfo>>(),
  mediaUrlMock: vi.fn<(path: string) => Promise<string>>(),
}));

vi.mock("../lib/api", () => ({
  TASK_LABELS: { monologue: "Độc thoại" },
  LANG_LABELS: { vi: "Tiếng Việt" },
  api: {
    listAssessments: listAssessmentsMock,
    getAssessment: getAssessmentMock,
    inspectFile: inspectFileMock,
    mediaUrl: mediaUrlMock,
    deleteAssessment: vi.fn(),
    exportAssessmentExcel: vi.fn(),
    revealInFolder: vi.fn(),
  },
}));

import { HistoryPage } from "./HistoryPage";

const BASE_SUMMARY: AssessmentSummary = {
  id: 101,
  created_at: "2026-11-14T10:00:00Z",
  video_name: "hoc_sinh_an.mp4",
  rubric_id: "flexible",
  rubric_name: "Lớp 8A - Unit 5",
  task_type: "monologue",
  model: "gemini-2.5-flash",
  feedback_lang: "vi",
  task_summary: "Nói về lễ hội",
  student_count: 1,
  student_names: "Nguyễn Văn An",
  duration_ms: 3200,
};

const BASE_DETAIL: AssessmentDetail = {
  id: 101,
  created_at: "2026-11-14T10:00:00Z",
  video_name: "hoc_sinh_an.mp4",
  video_path: "/videos/hoc_sinh_an.mp4",
  video_size_bytes: 1024 * 1024,
  rubric_id: "flexible",
  rubric_name: "Lớp 8A - Unit 5",
  task_type: "monologue",
  model: "gemini-2.5-flash",
  feedback_lang: "vi",
  media_resolution: "low",
  detected_language: "en",
  task_summary: "Nói về lễ hội",
  general_notes: "",
  duration_ms: 3200,
  students: [
    {
      id: 1,
      original_ai_name: "Nguyễn Văn An",
      assessment: {
        student_name: "Nguyễn Văn An",
        name_confident: true,
        criteria: [],
        total_score: 8.5,
        max_total_score: 10,
        overall_level: "B1",
        strengths: ["Tự tin"],
        weaknesses: ["Ngữ điệu"],
        improvement_suggestions: ["Luyện nối âm"],
        practice_directions: ["Shadowing"],
        evidence: [],
      },
    },
  ],
};

describe("HistoryPage video playback availability", () => {
  it("shows video player and file path when video file still exists on disk", async () => {
    listAssessmentsMock.mockResolvedValueOnce([BASE_SUMMARY]);
    getAssessmentMock.mockResolvedValueOnce(BASE_DETAIL);
    inspectFileMock.mockResolvedValueOnce({
      path: "/videos/hoc_sinh_an.mp4",
      name: "hoc_sinh_an.mp4",
      size_bytes: 1024 * 1024,
      size_mb: 1,
    });
    mediaUrlMock.mockResolvedValueOnce("http://127.0.0.1:43210/media?p=1");

    render(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("/videos/hoc_sinh_an.mp4")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Mở thư mục/i })
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Xem lại video bài nói \(hoc_sinh_an\.mp4\)/)
      ).toBeInTheDocument();
    });
  });

  it("hides video player when video file no longer exists", async () => {
    listAssessmentsMock.mockResolvedValueOnce([BASE_SUMMARY]);
    getAssessmentMock.mockResolvedValueOnce(BASE_DETAIL);
    inspectFileMock.mockRejectedValueOnce(new Error("File not found"));

    render(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Nguyễn Văn An")).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Xem lại video bài nói/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("/videos/hoc_sinh_an.mp4")
    ).not.toBeInTheDocument();
  });
});
