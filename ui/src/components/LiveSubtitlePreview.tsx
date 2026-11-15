import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Play,
  Plus,
  Save,
  Scissors,
  Trash2,
} from "lucide-react";
import { formatDuration, parseTimecodeToSeconds } from "../lib/mediaUtils";
import {
  formatPreviewSpeakerPrefix,
  roleBadgeStyle,
  type SubtitleFontName,
} from "../lib/scriptUtils";
import type { TranscriptSegment, TranscriptSpeaker } from "../lib/types";
import { SelectField } from "./SelectField";
import { SubtitleIconQuickBar } from "./SubtitleIconQuickBar";

interface LiveSubtitlePreviewProps {
  segments: TranscriptSegment[];
  speakers: TranscriptSpeaker[];
  activeSegmentIdx: number;
  activePreviewSegment: TranscriptSegment | null;
  playerCurrentTime: number;
  subtitleFont: SubtitleFontName;
  showSubRole: boolean;
  showSubSpeaker: boolean;
  showSubText: boolean;
  showSubTranslation: boolean;
  showSubGrammar: boolean;
  scriptDirty: boolean;
  exportBusy: boolean;
  hasVideoSource?: boolean;
  ffmpegAvailable?: boolean;
  isTaskBusy?: boolean;
  onSeekPlayerTo: (rawTimestamp: string) => void;
  onUpdateSegmentAt: (idx: number, patch: Partial<TranscriptSegment>) => void;
  onAssignSegmentSpeaker: (idx: number, speakerId: string) => void;
  onCaptureSegmentTime: (idx: number, field: "start_time" | "end_time") => void;
  onNudgeSegmentTime?: (
    idx: number,
    field: "start_time" | "end_time",
    deltaSecs: number
  ) => void;
  onExportSegmentClip?: (idx: number) => void;
  onInsertSegmentAtCurrentTime: () => number | null;
  onDeleteSegmentAt: (idx: number) => void;
  onSaveUpdatedMarkdown: () => void;
}

export function LiveSubtitlePreview({
  segments,
  speakers,
  activeSegmentIdx,
  activePreviewSegment,
  playerCurrentTime,
  subtitleFont,
  showSubRole,
  showSubSpeaker,
  showSubText,
  showSubTranslation,
  showSubGrammar,
  scriptDirty,
  exportBusy,
  hasVideoSource = false,
  ffmpegAvailable = false,
  isTaskBusy = false,
  onSeekPlayerTo,
  onUpdateSegmentAt,
  onAssignSegmentSpeaker,
  onCaptureSegmentTime,
  onNudgeSegmentTime,
  onExportSegmentClip,
  onInsertSegmentAtCurrentTime,
  onDeleteSegmentAt,
  onSaveUpdatedMarkdown,
}: LiveSubtitlePreviewProps) {
  const [pinnedEditIdx, setPinnedEditIdx] = useState<number | null>(null);

  const editIdx =
    pinnedEditIdx !== null && pinnedEditIdx >= 0 && pinnedEditIdx < segments.length
      ? pinnedEditIdx
      : null;
  const editSeg = editIdx !== null ? segments[editIdx] : null;
  const displayIdx = editIdx ?? (activeSegmentIdx >= 0 ? activeSegmentIdx : null);
  const displaySeg = editSeg ?? activePreviewSegment;

  // Compute prev/next segment indices for quick navigation from the video player
  const { prevIdx, nextIdx } = (() => {
    if (segments.length === 0) return { prevIdx: null, nextIdx: null };
    if (displayIdx !== null) {
      return {
        prevIdx: displayIdx > 0 ? displayIdx - 1 : null,
        nextIdx: displayIdx < segments.length - 1 ? displayIdx + 1 : null,
      };
    }
    let lastBefore: number | null = null;
    let firstAfter: number | null = null;
    for (let i = 0; i < segments.length; i += 1) {
      const start = parseTimecodeToSeconds(segments[i].start_time);
      if (start === null) continue;
      if (start <= playerCurrentTime) {
        lastBefore = i;
      } else if (firstAfter === null) {
        firstAfter = i;
      }
    }
    return { prevIdx: lastBefore, nextIdx: firstAfter };
  })();

  function jumpToSegment(targetIdx: number | null) {
    if (targetIdx === null || !segments[targetIdx]) return;
    onSeekPlayerTo(segments[targetIdx].start_time);
    if (editIdx !== null) {
      setPinnedEditIdx(targetIdx);
    }
  }

  function handleInsertHere() {
    const newIdx = onInsertSegmentAtCurrentTime();
    if (newIdx !== null) {
      setPinnedEditIdx(newIdx);
    }
  }

  function handleDeleteCurrent() {
    if (editIdx === null) return;
    onDeleteSegmentAt(editIdx);
    setPinnedEditIdx(null);
  }

  return (
    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
      {/* Header + quick prev/next navigation */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-950">
          <span>Phụ đề &amp; Sửa nhanh</span>
          <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
            {subtitleFont}
          </span>
          {displayIdx !== null && (
            <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              #{displayIdx + 1}/{segments.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={prevIdx === null}
            onClick={() => jumpToSegment(prevIdx)}
            title="Nhảy tới câu trước"
            aria-label="Câu trước"
            className="rounded-md border border-indigo-200 bg-white p-1 text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={nextIdx === null}
            onClick={() => jumpToSegment(nextIdx)}
            title="Nhảy tới câu tiếp theo"
            aria-label="Câu tiếp theo"
            className="rounded-md border border-indigo-200 bg-white p-1 text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="rounded-md bg-indigo-100/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">
            {formatDuration(playerCurrentTime)}
          </span>
        </div>
      </div>

      {/* Live WYSIWYG subtitle preview */}
      <div
        onClick={() => {
          if (editIdx === null && activeSegmentIdx >= 0) {
            setPinnedEditIdx(activeSegmentIdx);
          }
        }}
        title={
          editIdx === null && activeSegmentIdx >= 0
            ? "Bấm để sửa nhanh câu phụ đề này"
            : undefined
        }
        className={`rounded-lg border border-indigo-200/80 bg-white px-3 py-2.5 text-slate-900 shadow-xs ${
          editIdx === null && activeSegmentIdx >= 0
            ? "cursor-pointer transition hover:border-indigo-400"
            : ""
        }`}
        style={{
          fontFamily: `"${subtitleFont}", "Noto Emoji", sans-serif`,
        }}
      >
        {displaySeg ? (
          (() => {
            const prefix = formatPreviewSpeakerPrefix(
              displaySeg,
              showSubSpeaker,
              showSubRole
            );
            const hasText = showSubText && displaySeg.text.trim().length > 0;
            const hasTrans =
              showSubTranslation && displaySeg.translation.trim().length > 0;
            const hasGram =
              showSubGrammar && displaySeg.grammar_note.trim().length > 0;
            if (!hasText && !hasTrans && !hasGram) {
              return (
                <p className="text-center text-[11px] italic text-slate-500">
                  Các thành phần phụ đề của đoạn này đang được tắt hiển thị hoặc chưa có nội dung.
                </p>
              );
            }
            const prefixSpan = prefix ? (
              <>
                <span
                  className={`font-bold ${
                    displaySeg.role === "teacher"
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  [{prefix}]:
                </span>{" "}
              </>
            ) : null;
            return (
              <div className="space-y-0.5 text-center">
                {hasText && (
                  <p className="text-xs leading-snug text-slate-900">
                    {prefixSpan}
                    {displaySeg.text}
                  </p>
                )}
                {hasTrans && (
                  <p className="text-[11px] italic text-slate-600">
                    {!hasText && prefixSpan}
                    {displaySeg.translation}
                  </p>
                )}
                {hasGram && (
                  <p className="text-[11px] text-indigo-700">
                    {!hasText && !hasTrans && prefixSpan}
                    💡 Sửa: {displaySeg.grammar_note}
                  </p>
                )}
              </div>
            );
          })()
        ) : (
          <p className="text-center text-[11px] italic text-slate-500">
            Bấm phát hoặc chọn mốc thời gian để xem &amp; sửa phụ đề ngay tại đây...
          </p>
        )}
      </div>

      {/* Quick actions bar (when not editing) */}
      {editIdx === null && (
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeSegmentIdx >= 0 && (
              <button
                type="button"
                onClick={() => setPinnedEditIdx(activeSegmentIdx)}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Pencil className="h-3 w-3" />
                Sửa câu #{activeSegmentIdx + 1}
              </button>
            )}
            <button
              type="button"
              onClick={handleInsertHere}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              title="Chèn thêm câu thoại mới tại mốc thời gian hiện tại của video"
            >
              <Plus className="h-3 w-3" />
              Thêm câu tại {formatDuration(playerCurrentTime)}
            </button>
          </div>

          {scriptDirty && (
            <button
              type="button"
              disabled={exportBusy}
              onClick={onSaveUpdatedMarkdown}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              Lưu .md
            </button>
          )}
        </div>
      )}

      {/* Inline quick editor right below the video player */}
      {editIdx !== null && editSeg && (
        <div className="space-y-2 rounded-lg border border-indigo-300 bg-white p-2.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
            <span className="text-[11px] font-bold text-indigo-800">
              Đang sửa câu #{editIdx + 1}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSeekPlayerTo(editSeg.start_time)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                title="Phát video từ đầu câu này"
              >
                <Play className="h-2.5 w-2.5 fill-current" />
                Phát câu
              </button>
              {onExportSegmentClip && hasVideoSource && (
                <button
                  type="button"
                  disabled={!ffmpegAvailable || isTaskBusy}
                  onClick={() => onExportSegmentClip(editIdx)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Cắt riêng đoạn video của câu này (kèm phụ đề & chỉnh sáng)"
                >
                  <Scissors className="h-2.5 w-2.5" />
                  Cắt clip
                </button>
              )}
              <button
                type="button"
                onClick={handleDeleteCurrent}
                className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                title="Xóa câu thoại này"
                aria-label="Xóa câu thoại này"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setPinnedEditIdx(null)}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-indigo-700"
              >
                <Check className="h-3 w-3" />
                Xong
              </button>
            </div>
          </div>

          {/* Speaker */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-600">
              Người nói
            </label>
            <SelectField
              size="xs"
              value={
                speakers.some((s) => s.id === editSeg.speaker_id)
                  ? editSeg.speaker_id
                  : ""
              }
              onChange={(val) => {
                if (val) {
                  onAssignSegmentSpeaker(editIdx, val);
                }
              }}
              placeholder="-- Chọn người nói --"
              ariaLabel="Chọn người nói cho đoạn thoại"
              className="mt-0.5"
              options={speakers.map((sp) => ({
                value: sp.id,
                label: sp.label,
                badge: roleBadgeStyle(sp.role).label,
              }))}
            />
          </div>

          {/* Timecodes */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-slate-600">
                  Bắt đầu
                </label>
                <button
                  type="button"
                  onClick={() => onCaptureSegmentTime(editIdx, "start_time")}
                  className="text-[10px] font-semibold text-indigo-600 hover:underline"
                >
                  Lấy giờ
                </button>
              </div>
              <input
                type="text"
                value={editSeg.start_time}
                onChange={(e) =>
                  onUpdateSegmentAt(editIdx, { start_time: e.target.value })
                }
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-xs focus:border-indigo-400 focus:outline-none"
              />
              {onNudgeSegmentTime && (
                <div className="mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onNudgeSegmentTime(editIdx, "start_time", -0.2)}
                    className="flex-1 rounded border border-slate-200 bg-slate-50 py-0.5 font-mono text-[10px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    title="Lùi thời gian bắt đầu 0.2 giây"
                  >
                    -0.2s
                  </button>
                  <button
                    type="button"
                    onClick={() => onNudgeSegmentTime(editIdx, "start_time", 0.2)}
                    className="flex-1 rounded border border-slate-200 bg-slate-50 py-0.5 font-mono text-[10px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    title="Tăng thời gian bắt đầu 0.2 giây"
                  >
                    +0.2s
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-slate-600">
                  Kết thúc
                </label>
                <button
                  type="button"
                  onClick={() => onCaptureSegmentTime(editIdx, "end_time")}
                  className="text-[10px] font-semibold text-indigo-600 hover:underline"
                >
                  Lấy giờ
                </button>
              </div>
              <input
                type="text"
                value={editSeg.end_time}
                onChange={(e) =>
                  onUpdateSegmentAt(editIdx, { end_time: e.target.value })
                }
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-xs focus:border-indigo-400 focus:outline-none"
              />
              {onNudgeSegmentTime && (
                <div className="mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onNudgeSegmentTime(editIdx, "end_time", -0.2)}
                    className="flex-1 rounded border border-slate-200 bg-slate-50 py-0.5 font-mono text-[10px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    title="Lùi thời gian kết thúc 0.2 giây"
                  >
                    -0.2s
                  </button>
                  <button
                    type="button"
                    onClick={() => onNudgeSegmentTime(editIdx, "end_time", 0.2)}
                    className="flex-1 rounded border border-slate-200 bg-slate-50 py-0.5 font-mono text-[10px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    title="Tăng thời gian kết thúc 0.2 giây"
                  >
                    +0.2s
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Speech text */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-600">
              Nội dung lời nói
            </label>
            <textarea
              rows={2}
              value={editSeg.text}
              onChange={(e) =>
                onUpdateSegmentAt(editIdx, { text: e.target.value })
              }
              placeholder="Nhập lời nói chuẩn..."
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
            />
            <SubtitleIconQuickBar
              label="Icon"
              value={editSeg.text}
              onChange={(next) => onUpdateSegmentAt(editIdx, { text: next })}
            />
          </div>

          {/* Translation & Grammar note */}
          <div className="space-y-1.5">
            <div>
              <label className="block text-[10px] font-semibold text-slate-600">
                Bản dịch tiếng Việt
              </label>
              <input
                type="text"
                value={editSeg.translation}
                onChange={(e) =>
                  onUpdateSegmentAt(editIdx, { translation: e.target.value })
                }
                placeholder="Dịch nghĩa..."
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-600">
                Gợi ý sửa lỗi / Nhận xét
              </label>
              <input
                type="text"
                value={editSeg.grammar_note}
                onChange={(e) =>
                  onUpdateSegmentAt(editIdx, { grammar_note: e.target.value })
                }
                placeholder="VD: Nên dùng 'went' thay vì 'go'..."
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-1.5">
            <button
              type="button"
              onClick={handleInsertHere}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Plus className="h-3 w-3" />
              Thêm câu tại {formatDuration(playerCurrentTime)}
            </button>

            {scriptDirty && (
              <button
                type="button"
                disabled={exportBusy}
                onClick={onSaveUpdatedMarkdown}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                Lưu .md
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
