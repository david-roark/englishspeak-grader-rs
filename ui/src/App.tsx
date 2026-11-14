import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Film,
  History,
  KeyRound,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { api, MEDIA_RES_OPTIONS } from "./lib/api";
import type { AppBootstrap } from "./lib/types";
import { SelectField } from "./components/SelectField";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { GradePage } from "./pages/GradePage";
import { HistoryPage } from "./pages/HistoryPage";
import { MediaToolsPage } from "./pages/MediaToolsPage";
import { RubricsPage } from "./pages/RubricsPage";
import { SettingsPage } from "./pages/SettingsPage";

type TabKey = "grade" | "rubrics" | "media" | "history" | "settings";

export function App() {
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [bootError, setBootError] = useState("");
  const [tab, setTab] = useState<TabKey>("grade");

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [mediaRes, setMediaRes] = useState("low");
  const [loadingModels, setLoadingModels] = useState(false);
  const [headerNotice, setHeaderNotice] = useState("");
  const [quickConfigOpen, setQuickConfigOpen] = useState(true);

  useEffect(() => {
    api
      .getBootstrap()
      .then((b) => {
        setBootstrap(b);
        setModels(b.fallback_models);
        setSelectedModel(b.default_model);
        setMediaRes(b.media_resolution);
      })
      .catch((e) => setBootError(String(e)));
  }, []);

  async function handleRefreshModels() {
    setLoadingModels(true);
    setHeaderNotice("");
    try {
      const fetched = await api.fetchModels(apiKeyInput.trim() || undefined);
      setModels(fetched);
      if (!fetched.includes(selectedModel) && fetched.length > 0) {
        setSelectedModel(fetched[0]);
      }
      setHeaderNotice(`✅ Đã tải ${fetched.length} model từ tài khoản Gemini của bạn.`);
    } catch (e) {
      setHeaderNotice(`⚠️ ${e}`);
    } finally {
      setLoadingModels(false);
    }
  }

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <h1 className="text-lg font-bold">Không thể khởi động ứng dụng</h1>
          <p className="mt-2 text-sm">{bootError}</p>
        </div>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Đang khởi tạo EnglishSpeak Grader...
      </div>
    );
  }

  const navItems: { key: TabKey; label: string; icon: typeof Sparkles }[] = [
    { key: "grade", label: "Chấm bài", icon: Sparkles },
    { key: "rubrics", label: "Rubric", icon: BookOpen },
    { key: "media", label: "Xưởng Media", icon: Film },
    { key: "history", label: "Lịch sử", icon: History },
    { key: "settings", label: "Cài đặt & Prompt", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Compact Responsive Top Bar */}
      <header className="relative z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1760px] px-3 sm:px-5 lg:px-6">
          {/* Row 1: Brand + Navigation + Status & Theme */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 py-2">
            <div className="flex flex-wrap items-center gap-3 lg:gap-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5.5 4.5h11A2.5 2.5 0 0 1 19 7v5.5a2.5 2.5 0 0 1-2.5 2.5H9.2l-3.4 2.6c-.45.34-1.05.02-1.05-.54V14.8A2.5 2.5 0 0 1 3 12.4V7A2.5 2.5 0 0 1 5.5 4.5Z"
                      fill="currentColor"
                    />
                    <rect x="7" y="8.2" width="1.6" height="3.6" rx="0.8" fill="#4f46e5" />
                    <rect x="10.2" y="6.8" width="1.6" height="6.4" rx="0.8" fill="#4f46e5" />
                    <rect x="13.4" y="7.8" width="1.6" height="4.4" rx="0.8" fill="#4f46e5" />
                    <circle cx="17.5" cy="16.5" r="4.2" fill="#10b981" stroke="#4f46e5" strokeWidth="1.2" />
                    <path
                      d="m15.7 16.6 1.2 1.2 2.4-2.5"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="leading-tight">
                  <h1 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                    EnglishSpeak Grader
                  </h1>
                  <p className="hidden text-[11px] text-slate-500 2xl:block">
                    Chấm bài nói tiếng Anh qua video bằng Gemini AI
                  </p>
                </div>
              </div>

              {/* Navigation Tabs */}
              <nav className="flex flex-wrap items-center gap-1">
                {navItems.map(({ key, label, icon: Icon }) => {
                  const active = tab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-[13px] ${
                        active
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span
                className={`hidden rounded-full px-2.5 py-1 font-medium sm:inline-flex ${
                  bootstrap.ffmpeg_path
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
                title={bootstrap.ffmpeg_path ?? "Chưa tìm thấy ffmpeg"}
              >
                {bootstrap.ffmpeg_path ? "FFmpeg: Sẵn sàng" : "FFmpeg: Thiếu"}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  bootstrap.has_api_key || apiKeyInput.trim()
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {apiKeyInput.trim()
                  ? "Key: Nhập tay"
                  : bootstrap.has_api_key
                  ? `Key: ${bootstrap.masked_api_key}`
                  : "Chưa có Key"}
              </span>
              <button
                type="button"
                onClick={() => setQuickConfigOpen((v) => !v)}
                aria-expanded={quickConfigOpen}
                title={
                  quickConfigOpen
                    ? "Thu gọn thanh cấu hình Gemini"
                    : "Mở thanh cấu hình Gemini nhanh"
                }
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                  quickConfigOpen
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{selectedModel}</span>
                {quickConfigOpen ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              <ThemeSwitcher />
            </div>
          </div>

          {/* Row 2: Collapsible Quick Config Bar */}
          {quickConfigOpen && (
            <div className="border-t border-slate-100 py-2">
              <div className="grid gap-2 md:grid-cols-12">
                <div className="md:col-span-5">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <KeyRound className="h-3 w-3" />
                      API Key:
                    </label>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={
                        bootstrap.has_api_key
                          ? "Đã lưu sẵn (để trống nếu dùng key này)"
                          : "Dán key từ https://aistudio.google.com"
                      }
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs focus:border-indigo-400 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="md:col-span-4">
                  <div className="flex items-center gap-1.5">
                    <label className="shrink-0 text-[11px] font-semibold text-slate-500">
                      Model:
                    </label>
                    <SelectField
                      value={selectedModel}
                      onChange={setSelectedModel}
                      options={models.map((m) => ({ value: m, label: m }))}
                      size="xs"
                      className="min-w-0 flex-1"
                      ariaLabel="Chọn model"
                    />
                    <button
                      type="button"
                      onClick={handleRefreshModels}
                      disabled={loadingModels}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      title="Tải danh sách model thực tế từ tài khoản"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${loadingModels ? "animate-spin" : ""}`}
                      />
                      Tải
                    </button>
                  </div>
                </div>

                <div className="md:col-span-3">
                  <div className="flex items-center gap-1.5">
                    <label className="shrink-0 text-[11px] font-semibold text-slate-500">
                      Quan sát:
                    </label>
                    <SelectField
                      value={mediaRes}
                      onChange={setMediaRes}
                      options={MEDIA_RES_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      size="xs"
                      className="min-w-0 flex-1"
                      ariaLabel="Mức độ quan sát media"
                    />
                  </div>
                </div>
              </div>

              {headerNotice && (
                <p className="mt-1.5 text-xs font-medium text-slate-600">
                  {headerNotice}
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1760px] flex-1 px-3 py-4 sm:px-5 lg:px-6">
        {tab === "grade" && (
          <GradePage
            apiKeyInput={apiKeyInput}
            model={selectedModel}
            mediaResolution={mediaRes}
            rubrics={bootstrap.rubrics}
            gradingAssignments={bootstrap.grading_assignments}
            promptProfiles={bootstrap.prompt_profiles}
            activePromptProfileId={bootstrap.active_prompt_profile_id}
            videoPresets={bootstrap.video_presets}
            ffmpegAvailable={Boolean(bootstrap.ffmpeg_path)}
            exportDir={bootstrap.export_dir}
            hasCustomExportDir={bootstrap.has_custom_export_dir}
            onBootstrapUpdated={(next) => setBootstrap(next)}
            onAssignmentsChanged={(grading_assignments) =>
              setBootstrap((prev) =>
                prev ? { ...prev, grading_assignments } : prev
              )
            }
          />
        )}

        {tab === "rubrics" && (
          <RubricsPage
            rubrics={bootstrap.rubrics}
            promptProfiles={bootstrap.prompt_profiles}
            activePromptProfileId={bootstrap.active_prompt_profile_id}
            onRubricsChanged={(rubrics) =>
              setBootstrap((prev) => (prev ? { ...prev, rubrics } : prev))
            }
          />
        )}

        {tab === "media" && (
          <MediaToolsPage
            apiKeyInput={apiKeyInput}
            model={selectedModel}
            videoPresets={bootstrap.video_presets}
            mp3Presets={bootstrap.mp3_presets}
            ffmpegAvailable={Boolean(bootstrap.ffmpeg_path)}
            defaultExportDir={bootstrap.export_dir}
            hasCustomExportDir={bootstrap.has_custom_export_dir}
          />
        )}

        {tab === "history" && <HistoryPage />}

        {tab === "settings" && (
          <SettingsPage
            bootstrap={bootstrap}
            onBootstrapUpdated={(next) => {
              setBootstrap(next);
              setSelectedModel(next.default_model);
              setMediaRes(next.media_resolution);
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
