import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  Music,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "../lib/api";
import { roleBadgeStyle, type SubtitleFontName } from "../lib/scriptUtils";
import type {
  GenerateScriptResponse,
  MediaOutput,
  TranscriptSegment,
} from "../lib/types";
import { MediaResultCard } from "./MediaResultCard";
import { SelectField } from "./SelectField";
import { SubtitleIconQuickBar } from "./SubtitleIconQuickBar";

export interface FilteredScriptSegment {
  seg: TranscriptSegment;
  originalIdx: number;
}

interface MediaScriptResultPanelProps {
  scriptResult: GenerateScriptResponse;
  hasVideoSource: boolean;
  ffmpegAvailable: boolean;
  isTaskBusy: boolean;
  exportBusy: boolean;
  exportNotice: string;
  copiedMd: boolean;
  scriptDirty: boolean;
  scriptSearch: string;
  setScriptSearch: (val: string) => void;
  filteredSegments: FilteredScriptSegment[];
  activeSegmentIdx: number;
  editingSegIdx: number | null;
  setEditingSegIdx: (idx: number | null) => void;
  burnMode: "hardsub" | "softsub";
  setBurnMode: (mode: "hardsub" | "softsub") => void;
  subtitleFont: SubtitleFontName;
  setSubtitleFont: (font: SubtitleFontName) => void;
  showSubRole: boolean;
  setShowSubRole: (val: boolean) => void;
  showSubSpeaker: boolean;
  setShowSubSpeaker: (val: boolean) => void;
  showSubText: boolean;
  setShowSubText: (val: boolean) => void;
  showSubTranslation: boolean;
  setShowSubTranslation: (val: boolean) => void;
  showSubGrammar: boolean;
  setShowSubGrammar: (val: boolean) => void;
  subtitledVideoOutput: MediaOutput | null;
  onCopyScriptMarkdown: () => void;
  onSaveUpdatedMarkdown: () => void;
  onExportScriptAs: (format: "srt" | "txt") => void;
  onSpeakerChange: (speakerId: string, newLabel: string, newRole: string) => void;
  onEmbedSubtitlesVideo: () => void;
  onSeekPlayerTo: (rawTimestamp: string) => void;
  onInsertSegmentAfter: (idx: number | null) => void;
  onDeleteSegmentAt: (idx: number) => void;
  onAssignSegmentSpeaker: (idx: number, speakerId: string) => void;
  onCaptureSegmentTime: (idx: number, field: "start_time" | "end_time") => void;
  onUpdateSegmentAt: (idx: number, patch: Partial<TranscriptSegment>) => void;
}

export function MediaScriptResultPanel({
  scriptResult,
  hasVideoSource,
  ffmpegAvailable,
  isTaskBusy,
  exportBusy,
  exportNotice,
  copiedMd,
  scriptDirty,
  scriptSearch,
  setScriptSearch,
  filteredSegments,
  activeSegmentIdx,
  editingSegIdx,
  setEditingSegIdx,
  burnMode,
  setBurnMode,
  subtitleFont,
  setSubtitleFont,
  showSubRole,
  setShowSubRole,
  showSubSpeaker,
  setShowSubSpeaker,
  showSubText,
  setShowSubText,
  showSubTranslation,
  setShowSubTranslation,
  showSubGrammar,
  setShowSubGrammar,
  subtitledVideoOutput,
  onCopyScriptMarkdown,
  onSaveUpdatedMarkdown,
  onExportScriptAs,
  onSpeakerChange,
  onEmbedSubtitlesVideo,
  onSeekPlayerTo,
  onInsertSegmentAfter,
  onDeleteSegmentAt,
  onAssignSegmentSpeaker,
  onCaptureSegmentTime,
  onUpdateSegmentAt,
}: MediaScriptResultPanelProps) {
  return (
    <div className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-xs">
      {/* Saved files banner */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-emerald-800">
              ✅ Đã tạo Script: {scriptResult.script_output.file_name}
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              {scriptResult.transcript.detected_language}
            </span>
            {scriptResult.reused_upload_cache && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                Dùng lại audio đã upload
              </span>
            )}
          </div>
          {scriptResult.transcript.summary && (
            <p className="text-xs text-slate-600">
              {scriptResult.transcript.summary}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>
              Script:{" "}
              <strong className="text-slate-700">
                {scriptResult.script_output.output_path}
              </strong>
            </span>
            {scriptResult.mp3_output && (
              <span>
                MP3:{" "}
                <strong className="text-slate-700">
                  {scriptResult.mp3_output.file_name}
                </strong>{" "}
                ({scriptResult.mp3_output.size_mb.toFixed(2)} MB)
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              api.openLocalFile(scriptResult.script_output.output_path)
            }
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Mở Script
          </button>
          <button
            type="button"
            onClick={() =>
              api.revealInFolder(scriptResult.script_output.output_path)
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Thư mục
          </button>
          {scriptResult.mp3_output && (
            <button
              type="button"
              onClick={() =>
                api.openLocalFile(scriptResult.mp3_output!.output_path)
              }
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <Music className="h-3.5 w-3.5" />
              Mở MP3
            </button>
          )}
        </div>
      </div>

      {/* Action toolbar & search */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onCopyScriptMarkdown}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copiedMd ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Đã chép Markdown
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Sao chép Markdown
              </>
            )}
          </button>
          <button
            type="button"
            disabled={exportBusy}
            onClick={onSaveUpdatedMarkdown}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
              scriptDirty
                ? "border-amber-500 bg-amber-500 text-white shadow-sm ring-2 ring-amber-200 hover:bg-amber-600"
                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            }`}
            title="Ghi đè lại file đã lưu sau khi chỉnh sửa script"
          >
            <Download className="h-3.5 w-3.5" />
            {scriptDirty ? "Lưu thay đổi vào file" : "Lưu cập nhật file"}
            {scriptDirty && (
              <span className="rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                Chưa lưu
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={exportBusy}
            onClick={() => onExportScriptAs("srt")}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Xuất phụ đề .srt
          </button>
          <button
            type="button"
            disabled={exportBusy}
            onClick={() => onExportScriptAs("txt")}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Xuất .txt
          </button>
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={scriptSearch}
            onChange={(e) => setScriptSearch(e.target.value)}
            placeholder="Tìm trong lời thoại..."
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2.5 text-xs focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {exportNotice && (
        <div className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
          ✅ {exportNotice}
        </div>
      )}

      {/* Quick Speaker Rename & Role Editor */}
      {scriptResult.transcript.speakers.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Users className="h-3.5 w-3.5 text-indigo-600" />
            Người nói được nhận diện (sửa tên/vai trò để cập nhật cả script):
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scriptResult.transcript.speakers.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5"
              >
                <SelectField
                  size="xs"
                  value={sp.role}
                  onChange={(val) => onSpeakerChange(sp.id, sp.label, val)}
                  ariaLabel={`Vai trò của ${sp.label}`}
                  className="w-28 shrink-0"
                  options={[
                    { value: "teacher", label: "Giáo viên" },
                    { value: "student", label: "Học sinh" },
                    { value: "other", label: "Khác" },
                  ]}
                />
                <input
                  type="text"
                  value={sp.label}
                  onChange={(e) =>
                    onSpeakerChange(sp.id, e.target.value, sp.role)
                  }
                  aria-label={`Tên hiển thị của ${sp.id}`}
                  className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-800 focus:border-indigo-400 focus:outline-none"
                />
                {!sp.name_confident && (
                  <span
                    className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                    title="AI đặt nhãn tạm vì chưa nghe rõ tên thật"
                  >
                    Tạm
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Embed Script into Video Panel */}
      {hasVideoSource && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <Film className="h-4 w-4 text-indigo-600" />
              Ghép Script hiện tại vào Video (Xuất MP4 có phụ đề)
            </div>
            <span className="text-[11px] text-indigo-700">
              Dùng trực tiếp nội dung bạn vừa chỉnh sửa bên dưới
            </span>
          </div>
          <div className="mt-2.5 space-y-2.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Kiểu ghép phụ đề
                </label>
                <SelectField
                  size="xs"
                  value={burnMode}
                  onChange={(val) =>
                    setBurnMode(val === "softsub" ? "softsub" : "hardsub")
                  }
                  ariaLabel="Kiểu ghép phụ đề vào video"
                  className="mt-1"
                  options={[
                    {
                      value: "hardsub",
                      label: "In cứng (Hardsub)",
                      badge: "Khuyên dùng",
                      description:
                        "Mọi thiết bị/Zalo đều hiện & giữ màu vai trò",
                    },
                    {
                      value: "softsub",
                      label: "Phụ đề mềm (Softsub mov_text)",
                      description:
                        "Xuất cực nhanh, người xem tự bật/tắt phụ đề",
                    },
                  ]}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Font chữ Google (Tiếng Việt &amp; Icon)
                </label>
                <SelectField
                  size="xs"
                  value={subtitleFont}
                  onChange={(val) => setSubtitleFont(val as SubtitleFontName)}
                  disabled={burnMode === "softsub"}
                  ariaLabel="Chọn font chữ Google cho phụ đề"
                  className="mt-1"
                  options={[
                    {
                      value: "Be Vietnam Pro",
                      label: "Be Vietnam Pro",
                      badge: "Khuyên dùng",
                      description: "Dấu tiếng Việt cực nét, hiện đại",
                    },
                    {
                      value: "Noto Sans",
                      label: "Noto Sans",
                      description: "Chuẩn phiên âm IPA & đa ngôn ngữ",
                    },
                    {
                      value: "Lexend",
                      label: "Lexend",
                      description: "Khoáng đạt, dễ đọc khi luyện nghe",
                    },
                  ]}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-700">
                  Thành phần hiển thị trên phụ đề (đồng bộ Xem trước &amp; Video):
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubRole(true);
                      setShowSubSpeaker(true);
                      setShowSubText(true);
                      setShowSubTranslation(true);
                      setShowSubGrammar(true);
                    }}
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Hiện đầy đủ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubRole(false);
                      setShowSubSpeaker(false);
                      setShowSubText(true);
                      setShowSubTranslation(false);
                      setShowSubGrammar(false);
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Chỉ lời thoại sạch
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  {
                    id: "role",
                    label: "Vai trò (GV/HS)",
                    checked: showSubRole,
                    onChange: setShowSubRole,
                  },
                  {
                    id: "speaker",
                    label: "Tên người nói",
                    checked: showSubSpeaker,
                    onChange: setShowSubSpeaker,
                  },
                  {
                    id: "text",
                    label: "Lời thoại gốc",
                    checked: showSubText,
                    onChange: setShowSubText,
                  },
                  {
                    id: "translation",
                    label: "Bản dịch tiếng Việt",
                    checked: showSubTranslation,
                    onChange: setShowSubTranslation,
                  },
                  {
                    id: "grammar",
                    label: "Gợi ý sửa lỗi",
                    checked: showSubGrammar,
                    onChange: setShowSubGrammar,
                  },
                ].map((item) => (
                  <label
                    key={item.id}
                    className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      item.checked
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-2xs"
                        : "border-slate-200 bg-slate-50/70 text-slate-500 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => item.onChange(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border transition ${
                        item.checked
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            {scriptDirty && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>
                  Script vừa có chỉnh sửa chưa lưu ra file. Hãy lưu lại để đồng bộ với video xuất ra.
                </span>
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={onSaveUpdatedMarkdown}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  <Download className="h-3 w-3" />
                  Lưu file ngay
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`text-[11px] ${
                  !showSubText && !showSubTranslation && !showSubGrammar
                    ? "font-medium text-rose-600"
                    : "text-slate-500"
                }`}
              >
                {!showSubText && !showSubTranslation && !showSubGrammar
                  ? "Hãy bật ít nhất 1 nội dung (Lời thoại, Dịch hoặc Gợi ý sửa)."
                  : burnMode === "hardsub"
                  ? "Tự đóng gói Noto Emoji vector & tự chỉnh cỡ chữ theo video ngang/dọc."
                  : "Softsub dùng font mặc định của trình phát video."}
              </span>
              <button
                type="button"
                onClick={onEmbedSubtitlesVideo}
                disabled={
                  isTaskBusy ||
                  !ffmpegAvailable ||
                  scriptResult.transcript.segments.length === 0 ||
                  (!showSubText && !showSubTranslation && !showSubGrammar)
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Film className="h-3.5 w-3.5" />
                Xuất Video + Script
              </button>
            </div>
          </div>
        </div>
      )}

      {subtitledVideoOutput && (
        <MediaResultCard
          output={subtitledVideoOutput}
          actionLabel={
            burnMode === "hardsub"
              ? "Video Hardsub (In cứng Script)"
              : "Video Softsub (Phụ đề mềm)"
          }
        />
      )}

      {/* Segments Timeline List with Inline Editor */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700">
            Lời thoại chi tiết ({scriptResult.transcript.segments.length} câu — bấm biểu tượng bút để sửa từng câu)
          </span>
          <button
            type="button"
            onClick={() => onInsertSegmentAfter(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm câu thoại
          </button>
        </div>

        {filteredSegments.length === 0 ? (
          <p className="rounded-lg bg-slate-50 py-6 text-center text-xs text-slate-500">
            Không có đoạn hội thoại nào khớp với bộ lọc hiện tại.
          </p>
        ) : (
          filteredSegments.map(({ seg, originalIdx }) => {
            const roleInfo = roleBadgeStyle(seg.role);
            const timeLabel = seg.end_time.trim()
              ? `${seg.start_time.trim()} – ${seg.end_time.trim()}`
              : seg.start_time.trim();
            const isEditing = editingSegIdx === originalIdx;
            const isPlayingNow = activeSegmentIdx === originalIdx;

            return (
              <div
                key={`seg-${originalIdx}`}
                className={`rounded-xl border p-3 transition ${
                  isPlayingNow
                    ? "border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-200"
                    : isEditing
                    ? "border-indigo-300 bg-white shadow-xs"
                    : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSeekPlayerTo(seg.start_time)}
                      title={`Tua player cột trái tới ${seg.start_time} và phát`}
                      className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <Play className="h-2.5 w-2.5 fill-current" />
                      {timeLabel}
                    </button>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${roleInfo.badgeClass}`}
                    >
                      {roleInfo.label}
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {seg.speaker_label}
                    </span>
                    {isPlayingNow && (
                      <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Đang phát
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingSegIdx(isEditing ? null : originalIdx)
                      }
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                        isEditing
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                      title={
                        isEditing
                          ? "Đóng trình sửa câu này"
                          : "Sửa lời thoại, thời gian hoặc người nói"
                      }
                    >
                      {isEditing ? (
                        <>
                          <Check className="h-3 w-3" />
                          Xong
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3 w-3" />
                          Sửa
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onInsertSegmentAfter(originalIdx)}
                      className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                      title="Chèn thêm câu thoại ngay dưới dòng này"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSegmentAt(originalIdx)}
                      className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      title="Xóa dòng thoại này"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5">
                    <div className="grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-semibold text-slate-600">
                          Chọn người nói
                        </label>
                        <SelectField
                          size="xs"
                          value={
                            scriptResult.transcript.speakers.some(
                              (s) => s.id === seg.speaker_id
                            )
                              ? seg.speaker_id
                              : ""
                          }
                          onChange={(val) => {
                            if (val) {
                              onAssignSegmentSpeaker(originalIdx, val);
                            }
                          }}
                          placeholder="-- Chọn người nói --"
                          ariaLabel="Chọn người nói cho đoạn thoại"
                          className="mt-0.5"
                          options={scriptResult.transcript.speakers.map(
                            (sp) => ({
                              value: sp.id,
                              label: sp.label,
                              badge: roleBadgeStyle(sp.role).label,
                            })
                          )}
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-semibold text-slate-600">
                            Bắt đầu
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              onCaptureSegmentTime(originalIdx, "start_time")
                            }
                            className="text-[10px] font-semibold text-indigo-600 hover:underline"
                          >
                            Lấy giờ Player
                          </button>
                        </div>
                        <input
                          type="text"
                          value={seg.start_time}
                          onChange={(e) =>
                            onUpdateSegmentAt(originalIdx, {
                              start_time: e.target.value,
                            })
                          }
                          className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-xs focus:border-indigo-400 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-semibold text-slate-600">
                            Kết thúc
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              onCaptureSegmentTime(originalIdx, "end_time")
                            }
                            className="text-[10px] font-semibold text-indigo-600 hover:underline"
                          >
                            Lấy giờ Player
                          </button>
                        </div>
                        <input
                          type="text"
                          value={seg.end_time}
                          onChange={(e) =>
                            onUpdateSegmentAt(originalIdx, {
                              end_time: e.target.value,
                            })
                          }
                          className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-xs focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600">
                        Nội dung lời nói
                      </label>
                      <textarea
                        rows={2}
                        value={seg.text}
                        onChange={(e) =>
                          onUpdateSegmentAt(originalIdx, {
                            text: e.target.value,
                          })
                        }
                        placeholder="Nhập lời nói chuẩn..."
                        className="mt-0.5 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                      />
                      <SubtitleIconQuickBar
                        label="Chèn icon"
                        value={seg.text}
                        onChange={(next) =>
                          onUpdateSegmentAt(originalIdx, { text: next })
                        }
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">
                          Bản dịch tiếng Việt (tùy chọn)
                        </label>
                        <input
                          type="text"
                          value={seg.translation}
                          onChange={(e) =>
                            onUpdateSegmentAt(originalIdx, {
                              translation: e.target.value,
                            })
                          }
                          placeholder="Dịch nghĩa..."
                          className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">
                          Gợi ý sửa lỗi / Nhận xét (tùy chọn)
                        </label>
                        <input
                          type="text"
                          value={seg.grammar_note}
                          onChange={(e) =>
                            onUpdateSegmentAt(originalIdx, {
                              grammar_note: e.target.value,
                            })
                          }
                          placeholder="VD: Nên dùng 'went' thay vì 'go'..."
                          className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                        />
                        <SubtitleIconQuickBar
                          label="Icon sửa lỗi"
                          value={seg.grammar_note}
                          onChange={(next) =>
                            onUpdateSegmentAt(originalIdx, {
                              grammar_note: next,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-800">
                      {seg.text || (
                        <span className="italic text-slate-400">
                          (Chưa có lời thoại — bấm Sửa để nhập)
                        </span>
                      )}
                    </p>

                    {seg.translation.trim() && (
                      <p className="mt-1 text-xs italic text-slate-600">
                        Dịch: {seg.translation}
                      </p>
                    )}

                    {seg.grammar_note.trim() && (
                      <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-xs text-amber-900">
                        💡 <strong>Gợi ý sửa:</strong> {seg.grammar_note}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
