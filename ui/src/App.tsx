import { useEffect, useState } from "react";
import {
  BookmarkCheck,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Film,
  History,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { api, MEDIA_RES_OPTIONS } from "./lib/api";
import type { AppBootstrap } from "./lib/types";
import { SelectField } from "./components/SelectField";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { AssignmentsPage } from "./pages/AssignmentsPage";
import { GradePage } from "./pages/GradePage";
import { HistoryPage } from "./pages/HistoryPage";
import { MediaToolsPage } from "./pages/MediaToolsPage";
import { RubricsPage } from "./pages/RubricsPage";
import { SettingsPage } from "./pages/SettingsPage";

type TabKey =
  | "grade"
  | "rubrics"
  | "assignments"
  | "media"
  | "history"
  | "settings";

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
  const [quickConfigOpen, setQuickConfigOpen] = useState(false);
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(
    null
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("esg-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("esg-sidebar-collapsed", String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

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

  const navItems: { key: TabKey; label: string; desc: string; icon: typeof Sparkles }[] = [
    { key: "grade", label: "Chấm bài", desc: "Chấm video nói bằng AI", icon: Sparkles },
    { key: "rubrics", label: "Rubric", desc: "Quản lý tiêu chuẩn chấm", icon: BookOpen },
    { key: "assignments", label: "Đề chấm lẻ", desc: "Quản lý đề linh hoạt & đợt chấm", icon: BookmarkCheck },
    { key: "media", label: "Xưởng Media", desc: "Nén, cắt, tách MP3 & Script AI", icon: Film },
    { key: "history", label: "Lịch sử", desc: "Xem lại các bài đã chấm", icon: History },
    { key: "settings", label: "Cài đặt & Prompt", desc: "API Key, Prompt & Giao diện", icon: Settings },
  ];

  const activeNav = navItems.find((item) => item.key === tab) ?? navItems[0];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Left Sidebar */}
      <aside
        className={`hidden shrink-0 flex-col justify-between border-r border-slate-200 bg-white transition-all duration-200 md:flex ${
          sidebarCollapsed ? "w-16" : "w-56"
        }`}
      >
        <div>
          {/* Brand + Collapse Toggle */}
          <div
            className={`flex items-center border-b border-slate-100 py-3.5 ${
              sidebarCollapsed
                ? "flex-col justify-center gap-2 px-2"
                : "justify-between gap-2 px-3.5"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
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
              {!sidebarCollapsed && (
                <div className="min-w-0 leading-tight">
                  <h1 className="truncate text-sm font-bold tracking-tight text-slate-900">
                    EnglishSpeak
                  </h1>
                  <p className="truncate text-[11px] font-medium text-slate-400">
                    AI Video Grader
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
              aria-label={sidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
              aria-expanded={!sidebarCollapsed}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Vertical Navigation */}
          <nav className="space-y-1 p-2" aria-label="Điều hướng chính">
            {navItems.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  title={sidebarCollapsed ? label : undefined}
                  aria-label={label}
                  className={`flex w-full items-center rounded-xl py-2 text-[13px] font-semibold transition ${
                    sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3 text-left"
                  } ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? "text-indigo-600" : "text-slate-400"
                    }`}
                  />
                  {!sidebarCollapsed && <span className="truncate">{label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom System Status */}
        <div className="space-y-2 border-t border-slate-100 p-2.5 text-xs">
          <div
            className={`flex items-center rounded-lg bg-slate-50 py-1.5 ${
              sidebarCollapsed ? "justify-center px-1.5" : "gap-2 px-2.5"
            }`}
            title={bootstrap.ffmpeg_path ?? "Chưa tìm thấy ffmpeg"}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                bootstrap.ffmpeg_path ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {!sidebarCollapsed && (
              <span className="truncate text-[11px] font-medium text-slate-600">
                {bootstrap.ffmpeg_path ? "FFmpeg: Sẵn sàng" : "FFmpeg: Thiếu"}
              </span>
            )}
          </div>
          <div
            className={`flex items-center rounded-lg bg-slate-50 py-1.5 ${
              sidebarCollapsed ? "justify-center px-1.5" : "gap-2 px-2.5"
            }`}
            title={
              apiKeyInput.trim()
                ? "Key: Nhập tay"
                : bootstrap.has_api_key
                ? `Key: ${bootstrap.masked_api_key}`
                : "Chưa có API Key"
            }
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                bootstrap.has_api_key || apiKeyInput.trim()
                  ? "bg-indigo-500"
                  : "bg-rose-500"
              }`}
            />
            {!sidebarCollapsed && (
              <span className="truncate text-[11px] font-medium text-slate-600">
                {apiKeyInput.trim()
                  ? "Key: Nhập tay"
                  : bootstrap.has_api_key
                  ? `Key: ${bootstrap.masked_api_key}`
                  : "Chưa có API Key"}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Slim Top Utility Bar */}
        <header className="relative z-30 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
            {/* Mobile Brand + Active Page Title */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white md:hidden">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <h2 className="text-sm font-bold text-slate-900">
                  {activeNav.label}
                </h2>
                <p className="hidden text-[11px] text-slate-500 sm:block">
                  {activeNav.desc}
                </p>
              </div>
            </div>

            {/* Right Controls: Quick Gemini Config Trigger + Theme Switcher */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuickConfigOpen((v) => !v)}
                aria-expanded={quickConfigOpen}
                title={
                  quickConfigOpen
                    ? "Thu gọn cấu hình Gemini"
                    : "Cấu hình nhanh Model, API Key & Độ phân giải"
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  quickConfigOpen
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
                <span className="max-w-[140px] truncate sm:max-w-[200px]">
                  {selectedModel}
                </span>
                {quickConfigOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              <ThemeSwitcher />
            </div>
          </div>

          {/* Mobile Horizontal Nav (only on < md) */}
          <nav
            className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-3 py-1.5 md:hidden"
            aria-label="Điều hướng di động"
          >
            {navItems.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Collapsible Quick Config Bar (only visible when toggled) */}
          {quickConfigOpen && (
            <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:px-5">
              <div className="mx-auto grid max-w-[1680px] gap-2 md:grid-cols-12">
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
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs focus:border-indigo-400 focus:outline-none"
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
                <p className="mx-auto mt-1.5 max-w-[1680px] text-xs font-medium text-slate-600">
                  {headerNotice}
                </p>
              )}
            </div>
          )}
        </header>

        {/* Main Workspace */}
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-3 py-4 sm:px-5">
          <div className={tab === "grade" ? "" : "hidden"}>
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
              externalSelectedAssignmentId={pendingAssignmentId}
              onExternalAssignmentConsumed={() => setPendingAssignmentId(null)}
              onOpenAssignmentsManager={() => setTab("assignments")}
            />
          </div>

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

          {tab === "assignments" && (
            <AssignmentsPage
              assignments={bootstrap.grading_assignments}
              rubrics={bootstrap.rubrics}
              promptProfiles={bootstrap.prompt_profiles}
              activePromptProfileId={bootstrap.active_prompt_profile_id}
              onAssignmentsChanged={(grading_assignments) =>
                setBootstrap((prev) =>
                  prev ? { ...prev, grading_assignments } : prev
                )
              }
              onUseAssignment={(assignment) => {
                setPendingAssignmentId(assignment.id);
                setTab("grade");
              }}
            />
          )}

          <div className={tab === "media" ? "" : "hidden"}>
            <MediaToolsPage
              apiKeyInput={apiKeyInput}
              model={selectedModel}
              videoPresets={bootstrap.video_presets}
              mp3Presets={bootstrap.mp3_presets}
              ffmpegAvailable={Boolean(bootstrap.ffmpeg_path)}
              defaultExportDir={bootstrap.export_dir}
              hasCustomExportDir={bootstrap.has_custom_export_dir}
            />
          </div>

          {tab === "history" && <HistoryPage />}

          {tab === "settings" && (
            <SettingsPage
              bootstrap={bootstrap}
              onBootstrapUpdated={(next) => {
                setBootstrap(next);
                setSelectedModel(next.default_model);
                setMediaRes(next.media_resolution);
              }}
              onAssignmentsChanged={(grading_assignments) =>
                setBootstrap((prev) =>
                  prev ? { ...prev, grading_assignments } : prev
                )
              }
              onOpenAssignmentsManager={() => setTab("assignments")}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
