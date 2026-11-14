import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GradingAssignment, PromptProfile, Rubric } from "../lib/types";

const { saveGradingAssignmentMock, deleteGradingAssignmentMock } = vi.hoisted(
  () => ({
    saveGradingAssignmentMock:
      vi.fn<(a: GradingAssignment) => Promise<GradingAssignment[]>>(),
    deleteGradingAssignmentMock:
      vi.fn<(id: string) => Promise<GradingAssignment[]>>(),
  })
);

vi.mock("../lib/api", () => ({
  TASK_LABELS: {
    monologue: "Độc thoại (Monologue)",
    dialogue: "Hội thoại (Dialogue)",
  },
  LANG_LABELS: {
    vi: "Tiếng Việt",
    en: "English",
  },
  api: {
    saveGradingAssignment: saveGradingAssignmentMock,
    deleteGradingAssignment: deleteGradingAssignmentMock,
    pickImageFiles: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
    loadImageFile: vi.fn(),
  },
}));

import { AssignmentsPage } from "./AssignmentsPage";

const SAMPLE_RUBRICS: Rubric[] = [
  {
    id: "ielts_speaking",
    name: "IELTS Speaking",
    description: "Chuẩn IELTS",
    scale_note: "0-9",
    criteria: [],
    is_builtin: true,
    scoring_mode: "sum",
    target_scale: null,
    rounding_step: 0.5,
  },
];

const SAMPLE_PROFILES: PromptProfile[] = [
  {
    id: "standard",
    name: "Chuẩn mực",
    system_instruction: "",
    names_with_list: "",
    names_auto_detect: "",
    grading_rules: [],
    task_types: {},
    feedback_languages: {},
    temperature: 0.2,
    strictness: "balanced",
  },
];

const SAMPLE_ASSIGNMENTS: GradingAssignment[] = [
  {
    id: "unit5_speaking",
    name: "Lớp 8A - Unit 5 Speaking",
    mode: "flexible",
    rubric_id: null,
    max_score: 10,
    rounding_step: 0.5,
    requirements: "Miêu tả lễ hội truyền thống trong 2 phút.",
    task_type: "monologue",
    feedback_lang: "vi",
    prompt_profile_id: "standard",
    images: [],
  },
  {
    id: "unit6_dialogue",
    name: "Lớp 8B - Unit 6 Dialogue",
    mode: "flexible",
    rubric_id: null,
    max_score: 20,
    rounding_step: 0.5,
    requirements: "Đóng vai hỏi đường.",
    task_type: "dialogue",
    feedback_lang: "vi",
    prompt_profile_id: "standard",
    images: [],
  },
];

describe("AssignmentsPage", () => {
  it("filters assignments and triggers onUseAssignment", () => {
    const onUseAssignment = vi.fn();
    render(
      <AssignmentsPage
        assignments={SAMPLE_ASSIGNMENTS}
        rubrics={SAMPLE_RUBRICS}
        promptProfiles={SAMPLE_PROFILES}
        activePromptProfileId="standard"
        onAssignmentsChanged={vi.fn()}
        onUseAssignment={onUseAssignment}
      />
    );

    expect(screen.getByText("Đề chấm lẻ (2)")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Tìm tên đề hoặc yêu cầu..."), {
      target: { value: "Unit 6" },
    });
    expect(screen.getByText("Lớp 8B - Unit 6 Dialogue")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Lớp 8B - Unit 6 Dialogue"));
    fireEvent.click(screen.getByRole("button", { name: /Dùng đề này để chấm/i }));
    expect(onUseAssignment).toHaveBeenCalledWith(SAMPLE_ASSIGNMENTS[1]);
  });

  it("creates a new flexible assignment and deletes an existing one after confirmation", async () => {
    const onAssignmentsChanged = vi.fn();
    const created: GradingAssignment = {
      ...SAMPLE_ASSIGNMENTS[0],
      id: "de_moi_1234",
      name: "Đề mới kiểm tra",
      requirements: "Nói về sở thích cá nhân",
    };
    saveGradingAssignmentMock.mockResolvedValueOnce([
      ...SAMPLE_ASSIGNMENTS,
      created,
    ]);
    deleteGradingAssignmentMock.mockResolvedValueOnce([SAMPLE_ASSIGNMENTS[1]]);

    render(
      <AssignmentsPage
        assignments={SAMPLE_ASSIGNMENTS}
        rubrics={SAMPLE_RUBRICS}
        promptProfiles={SAMPLE_PROFILES}
        activePromptProfileId="standard"
        onAssignmentsChanged={onAssignmentsChanged}
        onUseAssignment={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Tạo đề mới/i })[0]);
    fireEvent.change(
      screen.getByPlaceholderText(/VD: Lớp 8A - Speaking Unit 5/i),
      { target: { value: "Đề mới kiểm tra" } }
    );
    fireEvent.change(
      screen.getByPlaceholderText(/Nhập đề bài, tiêu chí chia điểm/i),
      { target: { value: "Nói về sở thích cá nhân" } }
    );
    const createButtons = screen.getAllByRole("button", { name: /Tạo đề mới/i });
    fireEvent.click(createButtons[createButtons.length - 1]);

    await waitFor(() => {
      expect(saveGradingAssignmentMock).toHaveBeenCalledTimes(1);
      expect(onAssignmentsChanged).toHaveBeenCalledWith([
        ...SAMPLE_ASSIGNMENTS,
        created,
      ]);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Xóa$/i }));
    expect(screen.getByText("Xóa đề chấm lẻ?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa đề" }));

    await waitFor(() => {
      expect(deleteGradingAssignmentMock).toHaveBeenCalledWith("unit5_speaking");
      expect(onAssignmentsChanged).toHaveBeenCalledWith([SAMPLE_ASSIGNMENTS[1]]);
    });
  });
});
