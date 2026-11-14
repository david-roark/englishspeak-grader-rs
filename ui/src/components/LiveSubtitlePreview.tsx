import { formatDuration } from "../lib/mediaUtils";
import {
  formatPreviewSpeakerPrefix,
  type SubtitleFontName,
} from "../lib/scriptUtils";
import type { TranscriptSegment } from "../lib/types";

interface LiveSubtitlePreviewProps {
  activePreviewSegment: TranscriptSegment | null;
  playerCurrentTime: number;
  subtitleFont: SubtitleFontName;
  showSubRole: boolean;
  showSubSpeaker: boolean;
  showSubText: boolean;
  showSubTranslation: boolean;
  showSubGrammar: boolean;
}

export function LiveSubtitlePreview({
  activePreviewSegment,
  playerCurrentTime,
  subtitleFont,
  showSubRole,
  showSubSpeaker,
  showSubText,
  showSubTranslation,
  showSubGrammar,
}: LiveSubtitlePreviewProps) {
  return (
    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-950">
          <span>Xem trước phụ đề</span>
          <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
            {subtitleFont}
          </span>
        </div>
        <span className="rounded-md bg-indigo-100/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">
          {formatDuration(playerCurrentTime)}
        </span>
      </div>
      <div
        className="rounded-lg border border-indigo-200/80 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
        style={{
          fontFamily: `"${subtitleFont}", "Noto Emoji", sans-serif`,
        }}
      >
        {activePreviewSegment ? (
          (() => {
            const prefix = formatPreviewSpeakerPrefix(
              activePreviewSegment,
              showSubSpeaker,
              showSubRole
            );
            const hasText =
              showSubText && activePreviewSegment.text.trim().length > 0;
            const hasTrans =
              showSubTranslation &&
              activePreviewSegment.translation.trim().length > 0;
            const hasGram =
              showSubGrammar &&
              activePreviewSegment.grammar_note.trim().length > 0;
            if (!hasText && !hasTrans && !hasGram) {
              return (
                <p className="text-center text-[11px] italic text-slate-500">
                  Các thành phần phụ đề của đoạn này đang được tắt hiển thị.
                </p>
              );
            }
            const prefixSpan = prefix ? (
              <>
                <span
                  className={`font-bold ${
                    activePreviewSegment.role === "teacher"
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
                    {activePreviewSegment.text}
                  </p>
                )}
                {hasTrans && (
                  <p className="text-[11px] italic text-slate-600">
                    {!hasText && prefixSpan}
                    {activePreviewSegment.translation}
                  </p>
                )}
                {hasGram && (
                  <p className="text-[11px] text-indigo-700">
                    {!hasText && !hasTrans && prefixSpan}
                    💡 Sửa: {activePreviewSegment.grammar_note}
                  </p>
                )}
              </div>
            );
          })()
        ) : (
          <p className="text-center text-[11px] italic text-slate-500">
            Bấm phát hoặc chọn mốc thời gian để xem trước phụ đề chạy theo video...
          </p>
        )}
      </div>
    </div>
  );
}
