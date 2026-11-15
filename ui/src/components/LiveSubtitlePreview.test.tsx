import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TranscriptSegment, TranscriptSpeaker } from "../lib/types";
import { LiveSubtitlePreview } from "./LiveSubtitlePreview";

const SPEAKERS: TranscriptSpeaker[] = [
  { id: "S1", label: "Cô Lan", role: "teacher", name_confident: true },
  { id: "S2", label: "Minh", role: "student", name_confident: true },
];

const SEGMENTS: TranscriptSegment[] = [
  {
    start_time: "00:01.00",
    end_time: "00:04.00",
    speaker_id: "S1",
    speaker_label: "Cô Lan",
    role: "teacher",
    text: "Hello Minh",
    translation: "Xin chào Minh",
    grammar_note: "",
  },
  {
    start_time: "00:05.00",
    end_time: "00:09.00",
    speaker_id: "S2",
    speaker_label: "Minh",
    role: "student",
    text: "I go to school yesterday",
    translation: "Hôm qua em đi học",
    grammar_note: "go -> went",
  },
];

describe("LiveSubtitlePreview", () => {
  it("supports navigating segments and inline editing right in the video area", () => {
    const onSeekPlayerTo = vi.fn();
    const onUpdateSegmentAt = vi.fn();
    const onCaptureSegmentTime = vi.fn();
    const onNudgeSegmentTime = vi.fn();
    const onExportSegmentClip = vi.fn();
    const onInsertSegmentAtCurrentTime = vi.fn(() => 1);
    const onSaveUpdatedMarkdown = vi.fn();

    render(
      <LiveSubtitlePreview
        segments={SEGMENTS}
        speakers={SPEAKERS}
        activeSegmentIdx={0}
        activePreviewSegment={SEGMENTS[0]}
        playerCurrentTime={2.5}
        subtitleFont="Be Vietnam Pro"
        showSubRole={true}
        showSubSpeaker={true}
        showSubText={true}
        showSubTranslation={true}
        showSubGrammar={true}
        scriptDirty={true}
        exportBusy={false}
        hasVideoSource={true}
        ffmpegAvailable={true}
        isTaskBusy={false}
        onSeekPlayerTo={onSeekPlayerTo}
        onUpdateSegmentAt={onUpdateSegmentAt}
        onAssignSegmentSpeaker={vi.fn()}
        onCaptureSegmentTime={onCaptureSegmentTime}
        onNudgeSegmentTime={onNudgeSegmentTime}
        onExportSegmentClip={onExportSegmentClip}
        onInsertSegmentAtCurrentTime={onInsertSegmentAtCurrentTime}
        onDeleteSegmentAt={vi.fn()}
        onSaveUpdatedMarkdown={onSaveUpdatedMarkdown}
      />
    );

    // Jump to next segment from the header
    fireEvent.click(screen.getByRole("button", { name: "Câu tiếp theo" }));
    expect(onSeekPlayerTo).toHaveBeenCalledWith("00:05.00");

    // Open quick inline editor for active segment #1
    fireEvent.click(screen.getByRole("button", { name: /Sửa câu #1/i }));
    expect(screen.getByText("Đang sửa câu #1")).toBeInTheDocument();

    const textarea = screen.getByDisplayValue("Hello Minh");
    fireEvent.change(textarea, { target: { value: "Hello everyone" } });
    expect(onUpdateSegmentAt).toHaveBeenCalledWith(0, {
      text: "Hello everyone",
    });

    // Capture start time from player
    const captureBtns = screen.getAllByRole("button", { name: "Lấy giờ" });
    fireEvent.click(captureBtns[0]);
    expect(onCaptureSegmentTime).toHaveBeenCalledWith(0, "start_time");

    // Nudge start time (-0.2s) and export clip
    const nudgeMinusBtns = screen.getAllByRole("button", { name: "-0.2s" });
    fireEvent.click(nudgeMinusBtns[0]);
    expect(onNudgeSegmentTime).toHaveBeenCalledWith(0, "start_time", -0.2);

    fireEvent.click(screen.getByRole("button", { name: /Cắt clip/i }));
    expect(onExportSegmentClip).toHaveBeenCalledWith(0);

    // Save button is accessible right in the inline editor
    fireEvent.click(screen.getByRole("button", { name: /Lưu \.md/i }));
    expect(onSaveUpdatedMarkdown).toHaveBeenCalledTimes(1);

    // Insert new segment at current player time
    fireEvent.click(
      screen.getByRole("button", { name: /Thêm câu tại 00:02/i })
    );
    expect(onInsertSegmentAtCurrentTime).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Đang sửa câu #2")).toBeInTheDocument();
  });
});
