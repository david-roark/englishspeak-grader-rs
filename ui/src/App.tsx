import { useEffect, useState } from "react";
import {
  BookOpen,
  Film,
  GraduationCap,
  History,
  KeyRound,
  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react";
import { api, MEDIA_RES_OPTIONS } from "./lib/api";
import type { AppBootstrap } from "./lib/types";
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
    { key: "media", label: "Xử lý Video/Audio", icon: Film },
    { key: "history", label: "Lịch sử", icon: History },
    { key: "settings", label: "Cài đặt & Prompt", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  EnglishSpeak Grader
                </h1>
                <p className="text-xs text-slate-500">
                  Chấm bài nói tiếng Anh qua video bằng Gemini AI — chạy cục bộ, đa nền tảng
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  bootstrap.ffmpeg_path
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {bootstrap.ffmpeg_path ? "FFmpeg: Sẵn sàng" : "FFmpeg: Chưa tìm thấy"}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  bootstrap.has_api_key || apiKeyInput.trim()
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {apiKeyInput.trim()
                  ? "API Key: Đang nhập tay"
                  : bootstrap.has_api_key
                  ? `API Key: ${bootstrap.masked_api_key}`
                  : "Chưa có API Key"}
              </span>
              <ThemeSwitcher />
            </div>
          </div>

          {/* Quick Config Row */}
          <div className="mt-4 grid gap-3 md:grid-cols-12">
            <div className="md:col-span-5">
              <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <KeyRound className="h-3 w-3" />
                Gemini API Key (tùy chọn ghi đè)
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  bootstrap.has_api_key
                    ? "Đã có key đã lưu (để trống để dùng key này)"
                    : "Dán key từ https://aistudio.google.com"
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Model Gemini
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  disabled={loadingModels}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  title="Tải danh sách model thực tế từ tài khoản"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingModels ? "animate-spin" : ""}`}
                  />
                  Tải model
                </button>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Cấp độ quan sát hình ảnh
              </label>
              <select
                value={mediaRes}
                onChange={(e) => setMediaRes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
              >
                {MEDIA_RES_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {headerNotice && (
            <p className="mt-2 text-xs font-medium text-slate-600">{headerNotice}</p>
          )}

          {/* Navigation Tabs */}
          <nav className="mt-4 flex flex-wrap gap-1.5">
            {navItems.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === "grade" && (
          <GradePage
            apiKeyInput={apiKeyInput}
            model={selectedModel}
            mediaResolution={mediaRes}
            rubrics={bootstrap.rubrics}
            videoPresets={bootstrap.video_presets}
            ffmpegAvailable={Boolean(bootstrap.ffmpeg_path)}
          />
        )}

        {tab === "rubrics" && (
          <RubricsPage
            rubrics={bootstrap.rubrics}
            onRubricsChanged={(rubrics) =>
              setBootstrap((prev) => (prev ? { ...prev, rubrics } : prev))
            }
          />
        )}

        {tab === "media" && (
          <MediaToolsPage
            videoPresets={bootstrap.video_presets}
            mp3Presets={bootstrap.mp3_presets}
            ffmpegAvailable={Boolean(bootstrap.ffmpeg_path)}
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
