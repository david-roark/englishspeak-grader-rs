import { useState } from "react";
import {
  BookmarkCheck,
  Check,
  ExternalLink,
  FileText,
  FolderOpen,
  Info,
  KeyRound,
  Minus,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Sun,
  Trash2,
  Type,
} from "lucide-react";
import { api, LANG_LABELS, MEDIA_RES_OPTIONS, TASK_LABELS } from "../lib/api";
import { AboutDiagnosticsSection } from "../components/AboutDiagnosticsSection";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PromptConfigSection } from "../components/PromptConfigSection";
import { SelectField } from "../components/SelectField";
import { formatScoreNum } from "../lib/rubricUtils";
import {
  FONT_SIZE_PRESETS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  THEME_ACCENTS,
  THEME_MODES,
  useTheme,
  type ThemeMode,
} from "../lib/theme";
import type { AppBootstrap, GradingAssignment } from "../lib/types";

const MODE_ICON_MAP: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

interface SettingsPageProps {
  bootstrap: AppBootstrap;
  onBootstrapUpdated: (next: AppBootstrap) => void;
  onAssignmentsChanged: (next: GradingAssignment[]) => void;
  onOpenAssignmentsManager?: () => void;
}

type SettingsTab = "system" | "appearance" | "prompt" | "assignments" | "about";

const SETTINGS_TABS: {
  id: SettingsTab;
  label: string;
  icon: typeof KeyRound;
}[] = [
  { id: "system", label: "Hệ thống & API", icon: KeyRound },
  { id: "appearance", label: "Giao diện & Theme", icon: Palette },
  { id: "prompt", label: "Cấu hình Prompt", icon: FileText },
  { id: "assignments", label: "Đề chấm lẻ", icon: BookmarkCheck },
  { id: "about", label: "Thông tin & Nhật ký", icon: Info },
];

export function SettingsPage({
  bootstrap,
  onBootstrapUpdated,
  onAssignmentsChanged,
  onOpenAssignmentsManager,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("system");
  const [deleteTarget, setDeleteTarget] = useState<GradingAssignment | null>(
    null
  );
  const [assignmentMsg, setAssignmentMsg] = useState("");
  const [assignmentErr, setAssignmentErr] = useState("");
  const {
    mode,
    accent,
    fontSize,
    resolvedMode,
    setMode,
    setAccent,
    setFontSize,
    stepFontSize,
    resetTheme,
  } = useTheme();

  // App settings state
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [defaultModel, setDefaultModel] = useState(bootstrap.default_model);
  const [mediaRes, setMediaRes] = useState(bootstrap.media_resolution);
  const [exportDir, setExportDir] = useState(bootstrap.export_dir);
  const [ffmpegCustom, setFfmpegCustom] = useState(bootstrap.ffmpeg_custom_path);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsErr, setSettingsErr] = useState("");

  async function handleSaveAppSettings(clearKey = false) {
    setSettingsMsg("");
    setSettingsErr("");
    try {
      const updated = await api.saveSettings({
        api_key: clearKey ? undefined : apiKeyDraft.trim() || undefined,
        clear_api_key: clearKey,
        default_model: defaultModel,
        media_resolution: mediaRes,
        export_dir: exportDir,
        ffmpeg_custom_path: ffmpegCustom,
      });
      setApiKeyDraft("");
      onBootstrapUpdated(updated);
      setSettingsMsg("✅ Đã lưu cài đặt ứng dụng.");
    } catch (e) {
      setSettingsErr(String(e));
    }
  }

  return (
    <div className="space-y-4">
      {/* Segmented Settings Navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1">
        {SETTINGS_TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${
                active
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  active ? "text-indigo-600" : "text-slate-400"
                }`}
              />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: System & API Settings */}
      {activeTab === "system" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <KeyRound className="h-4 w-4 text-indigo-600" />
              Cài đặt hệ thống &amp; Gemini API
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 break-all">
              Database SQLite: <code>{bootstrap.db_path}</code>{" "}
              ({bootstrap.is_portable ? "Chế độ Portable" : "Thư mục chuẩn hệ điều hành"})
            </p>
          </div>

          <div className="mt-4 grid gap-3.5 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Gemini API Key{" "}
                {bootstrap.has_api_key && (
                  <span className="text-emerald-600">
                    (Đang lưu: {bootstrap.masked_api_key})
                  </span>
                )}
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder={
                    bootstrap.has_api_key
                      ? "Nhập key mới để thay thế..."
                      : "Dán key từ https://aistudio.google.com"
                  }
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                {bootstrap.has_api_key && (
                  <button
                    type="button"
                    onClick={() => void handleSaveAppSettings(true)}
                    className="shrink-0 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Xóa key
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Model mặc định khi mở app
              </label>
              <input
                type="text"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Cấp độ quan sát mặc định
              </label>
              <SelectField
                value={mediaRes}
                onChange={setMediaRes}
                options={MEDIA_RES_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                size="sm"
                className="mt-1 w-full"
                ariaLabel="Cấp độ quan sát mặc định"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Thư mục lưu Excel / Video nén / MP3
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={exportDir}
                  onChange={(e) => setExportDir(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const dir = await api.pickFolder("Chọn thư mục xuất file");
                    if (dir) setExportDir(dir);
                  }}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600">
                Đường dẫn FFmpeg{" "}
                <span className="font-normal text-slate-500">
                  (Đang dùng: {bootstrap.ffmpeg_path ?? "Chưa tìm thấy"})
                </span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={ffmpegCustom}
                  onChange={(e) => setFfmpegCustom(e.target.value)}
                  placeholder="Để trống để tự tìm sidecar hoặc PATH"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const file = await api.pickExecutable("Chọn binary ffmpeg");
                    if (file) setFfmpegCustom(file);
                  }}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Chọn file
                </button>
              </div>
            </div>
          </div>

          {settingsErr && (
            <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              ⚠️ {settingsErr}
            </div>
          )}
          {settingsMsg && (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {settingsMsg}
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => void handleSaveAppSettings(false)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Save className="h-4 w-4" />
              Lưu cài đặt
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Theme & Appearance Settings */}
      {activeTab === "appearance" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Palette className="h-4 w-4 text-indigo-600" />
                Giao diện &amp; Theme
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Áp dụng tức thì và lưu tự động trên máy.
              </p>
            </div>
            <button
              type="button"
              onClick={resetTheme}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Mặc định
            </button>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-600">
                  Chế độ hiển thị{" "}
                  {mode === "system" && (
                    <span className="font-normal text-slate-500">
                      (Hệ thống: {resolvedMode === "dark" ? "Tối" : "Sáng"})
                    </span>
                  )}
                </div>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                  {THEME_MODES.map((item) => {
                    const Icon = MODE_ICON_MAP[item.id];
                    const selected = mode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setMode(item.id)}
                        title={item.description}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                          selected
                            ? "border-indigo-400 bg-indigo-50/70"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div
                          className={`shrink-0 rounded-lg p-1.5 ${
                            selected
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">
                          {item.label}
                        </span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600">
                  Bảng màu chủ đạo
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {THEME_ACCENTS.map((item) => {
                    const selected = accent === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAccent(item.id)}
                        title={item.description}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                          selected
                            ? "border-indigo-400 bg-indigo-50/70"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/10"
                          style={{ backgroundColor: item.swatch }}
                        >
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900">
                            {item.label}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {item.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Font Size Controls */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Type className="h-3.5 w-3.5 text-indigo-600" />
                    Kích thước font chữ
                  </span>
                  <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
                    {fontSize} px
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={fontSize <= MIN_FONT_SIZE}
                    onClick={() => stepFontSize(-1)}
                    className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    title="Giảm cỡ chữ"
                  >
                    <Minus className="h-3 w-3" />
                    A
                  </button>
                  <input
                    type="range"
                    min={MIN_FONT_SIZE}
                    max={MAX_FONT_SIZE}
                    step={1}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    aria-label="Kích thước font chữ"
                    className="min-w-0 flex-1 accent-indigo-600"
                  />
                  <button
                    type="button"
                    disabled={fontSize >= MAX_FONT_SIZE}
                    onClick={() => stepFontSize(1)}
                    className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    title="Tăng cỡ chữ"
                  >
                    <Plus className="h-3 w-3" />
                    A
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {FONT_SIZE_PRESETS.map((p) => {
                    const selected = fontSize === p.size;
                    return (
                      <button
                        key={p.size}
                        type="button"
                        onClick={() => setFontSize(p.size)}
                        title={p.description}
                        className={`rounded-lg border px-2 py-1.5 text-center transition ${
                          selected
                            ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-800"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-xs">{p.label}</div>
                        <div className="font-mono text-[10px] text-slate-500">
                          {p.size}px
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Theme Preview */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-semibold text-slate-700">Thử màu:</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                    Nổi bật
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                    Tốt
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                    Lưu ý
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                    Phụ
                  </span>
                  <span className="rounded-lg bg-indigo-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                    Chính
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Prompt Profile Editor */}
      {activeTab === "prompt" && (
        <PromptConfigSection
          bootstrap={bootstrap}
          onBootstrapUpdated={onBootstrapUpdated}
        />
      )}

      {/* Tab 4: Saved Flexible Assignments */}
      {activeTab === "assignments" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <BookmarkCheck className="h-4 w-4 text-indigo-600" />
                Quản lý &amp; Xóa Đề chấm lẻ ({bootstrap.grading_assignments.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Xem nhanh hoặc xóa các đề chấm lẻ / đợt chấm đã lưu. Việc xóa đề không ảnh hưởng tới Lịch sử bài đã chấm.
              </p>
            </div>
            {onOpenAssignmentsManager && (
              <button
                type="button"
                onClick={onOpenAssignmentsManager}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Mở trang Đề chấm lẻ
              </button>
            )}
          </div>

          {assignmentMsg && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
              {assignmentMsg}
            </div>
          )}
          {assignmentErr && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
              ⚠️ {assignmentErr}
            </div>
          )}

          {bootstrap.grading_assignments.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
              <p className="text-xs font-semibold text-slate-600">
                Chưa có đề chấm lẻ nào được lưu.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Bạn có thể tạo mới ở trang &ldquo;Đề chấm lẻ&rdquo; hoặc lưu nhanh trong ngăn kéo Cấu hình ở trang Chấm điểm.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {bootstrap.grading_assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">
                        {a.name}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        {a.mode === "flexible"
                          ? `Linh hoạt · ${formatScoreNum(a.max_score)}đ`
                          : "Rubric"}
                      </span>
                      {a.images.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {a.images.length} ảnh đề
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {TASK_LABELS[a.task_type] ?? a.task_type} ·{" "}
                      {LANG_LABELS[a.feedback_lang] ?? a.feedback_lang}
                      {a.requirements.trim()
                        ? ` · ${a.requirements.trim().slice(0, 90)}${a.requirements.trim().length > 90 ? "…" : ""}`
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(a)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          )}

          <ConfirmDialog
            open={deleteTarget !== null}
            title="Xóa đề chấm lẻ?"
            description={`Bạn có chắc muốn xóa đề "${deleteTarget?.name ?? ""}"? Các kết quả đã chấm trong Lịch sử vẫn được giữ nguyên.`}
            confirmLabel="Xóa đề"
            onConfirm={() => {
              if (!deleteTarget) return;
              const target = deleteTarget;
              setDeleteTarget(null);
              setAssignmentErr("");
              setAssignmentMsg("");
              void api
                .deleteGradingAssignment(target.id)
                .then((updated) => {
                  onAssignmentsChanged(updated);
                  setAssignmentMsg(`🗑️ Đã xóa đề "${target.name}".`);
                })
                .catch((e) => setAssignmentErr(String(e)));
            }}
            onCancel={() => setDeleteTarget(null)}
          />
        </div>
      )}

      {/* Tab 5: About, Environment & Activity Log */}
      {activeTab === "about" && <AboutDiagnosticsSection />}
    </div>
  );
}
