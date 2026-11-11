import { useState } from "react";
import {
  Check,
  FolderOpen,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Sun,
} from "lucide-react";
import { api, MEDIA_RES_OPTIONS } from "../lib/api";
import { PromptConfigSection } from "../components/PromptConfigSection";
import { SelectField } from "../components/SelectField";
import {
  THEME_ACCENTS,
  THEME_MODES,
  useTheme,
  type ThemeMode,
} from "../lib/theme";
import type { AppBootstrap } from "../lib/types";

const MODE_ICON_MAP: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

interface SettingsPageProps {
  bootstrap: AppBootstrap;
  onBootstrapUpdated: (next: AppBootstrap) => void;
}

export function SettingsPage({
  bootstrap,
  onBootstrapUpdated,
}: SettingsPageProps) {
  const { mode, accent, resolvedMode, setMode, setAccent, resetTheme } =
    useTheme();

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
      <div className="grid items-start gap-4 xl:grid-cols-12">
        {/* Theme & Appearance Settings */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
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

          <div className="mt-3">
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

          <div className="mt-3.5">
            <div className="text-xs font-semibold text-slate-600">
              Bảng màu chủ đạo
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
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

          {/* Live Theme Preview */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
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

        {/* System & API Settings */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs xl:col-span-7">
          <h2 className="text-base font-bold text-slate-900">
            Cài đặt hệ thống &amp; Gemini API
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 break-all">
            Database SQLite: <code>{bootstrap.db_path}</code>{" "}
            ({bootstrap.is_portable ? "Chế độ Portable" : "Thư mục chuẩn hệ điều hành"})
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
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
            <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              ⚠️ {settingsErr}
            </div>
          )}
          {settingsMsg && (
            <div className="mt-3 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {settingsMsg}
            </div>
          )}

          <div className="mt-3 flex justify-end">
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
      </div>

      {/* Prompt Profile Editor */}
      <PromptConfigSection
        bootstrap={bootstrap}
        onBootstrapUpdated={onBootstrapUpdated}
      />
    </div>
  );
}
