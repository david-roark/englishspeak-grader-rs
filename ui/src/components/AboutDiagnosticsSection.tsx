import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  FolderOpen,
  Info,
  RefreshCw,
  ScrollText,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { ActivityLogEntry, AppDiagnostics } from "../lib/types";

type LogFilter = "ALL" | "INFO" | "WARN" | "ERROR";

function formatLogTime(timestampMs: number): string {
  if (!timestampMs) return "--:--:--";
  const d = new Date(timestampMs);
  return d.toLocaleTimeString("vi-VN", { hour12: false });
}

function levelBadgeClass(level: string): string {
  switch (level) {
    case "ERROR":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "WARN":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
}

function formatDiagnosticsReport(diag: AppDiagnostics): string {
  const lines = [
    `=== ${diag.app_name} v${diag.app_version} ===`,
    `OS/Arch: ${diag.os}/${diag.arch}`,
    `Mode: ${diag.is_portable ? "Portable" : "OS Standard DataDir"}`,
    `License: ${diag.license_summary}`,
    `FFmpeg: ${diag.ffmpeg_path ?? "Not found"}`,
    `Fonts Dir: ${diag.fonts_dir ?? "Not found"}`,
    `Media Server Port: ${diag.media_server_port}`,
    `Data Dir: ${diag.data_dir}`,
    `Exports Dir: ${diag.exports_dir}`,
    `Log File: ${diag.log_file_path}`,
    "",
    `--- Recent Activity Logs (${Math.min(diag.logs.length, 80)}/${diag.logs.length}) ---`,
  ];

  for (const entry of diag.logs.slice(0, 80)) {
    lines.push(
      `[${formatLogTime(entry.timestamp_ms)}] [${entry.level}] [${entry.category}] ${entry.message}`
    );
  }
  return lines.join("\n");
}

export function AboutDiagnosticsSection() {
  const [diag, setDiag] = useState<AppDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<LogFilter>("ALL");
  const [copied, setCopied] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const next = await api.getDiagnostics();
      setDiag(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  async function handleClearLogs() {
    setErr("");
    try {
      const next = await api.clearActivityLogs();
      setDiag(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCopyReport() {
    if (!diag) return;
    try {
      await navigator.clipboard.writeText(formatDiagnosticsReport(diag));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleOpenPath(targetPath: string) {
    setErr("");
    try {
      await api.openDiagnosticPath(targetPath);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const filteredLogs: ActivityLogEntry[] = useMemo(() => {
    if (!diag) return [];
    if (filter === "ALL") return diag.logs;
    return diag.logs.filter((entry) => entry.level === filter);
  }, [diag, filter]);

  const counts = useMemo(() => {
    const logs = diag?.logs ?? [];
    return {
      ALL: logs.length,
      INFO: logs.filter((l) => l.level === "INFO").length,
      WARN: logs.filter((l) => l.level === "WARN").length,
      ERROR: logs.filter((l) => l.level === "ERROR").length,
    };
  }, [diag]);

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      {/* About & Build Environment */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs xl:col-span-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Info className="h-4 w-4 text-indigo-600" />
            Giới thiệu &amp; Môi trường
          </h2>
          {diag && (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-700">
              v{diag.app_version}
            </span>
          )}
        </div>

        {diag ? (
          <div className="mt-3 space-y-2 text-xs text-slate-600">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Hệ điều hành
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {diag.os} / {diag.arch}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Chế độ dữ liệu
                </span>
                <span className="font-semibold text-slate-900">
                  {diag.is_portable ? "Portable" : "Chuẩn hệ điều hành"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Media Server
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  127.0.0.1:{diag.media_server_port}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Giấy phép
                </span>
                <span className="font-semibold text-slate-900">
                  Cá nhân (Phi thương mại)
                </span>
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/40 p-2.5">
              <div>
                <span className="font-semibold text-slate-700">FFmpeg: </span>
                <code className="break-all text-[11px] text-slate-700">
                  {diag.ffmpeg_path ?? "Chưa tìm thấy"}
                </code>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Thư mục Font: </span>
                <code className="break-all text-[11px] text-slate-700">
                  {diag.fonts_dir ?? "Dùng font hệ thống"}
                </code>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Thư mục dữ liệu: </span>
                <code className="break-all text-[11px] text-slate-700">
                  {diag.data_dir}
                </code>
              </div>
              <div>
                <span className="font-semibold text-slate-700">File nhật ký: </span>
                <code className="break-all text-[11px] text-slate-700">
                  {diag.log_file_path}
                </code>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleOpenPath(diag.data_dir)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Mở thư mục dữ liệu
              </button>
              <button
                type="button"
                onClick={() => void handleOpenPath(diag.log_file_path)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Mở file log
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            {loading ? "Đang tải thông tin chẩn đoán..." : "Chưa có dữ liệu chẩn đoán."}
          </p>
        )}
      </div>

      {/* Activity & Diagnostic Logs */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs xl:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ScrollText className="h-4 w-4 text-indigo-600" />
              Nhật ký hoạt động (Debug &amp; Báo lỗi)
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              API key tự động được che trước khi lưu và sao chép.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void loadDiagnostics()}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={() => void handleCopyReport()}
              disabled={!diag}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Đã sao chép" : "Sao chép báo cáo"}
            </button>
            <button
              type="button"
              onClick={() => void handleClearLogs()}
              disabled={!diag || diag.logs.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xoá log
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["ALL", "INFO", "WARN", "ERROR"] as LogFilter[]).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilter(lvl)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                filter === lvl
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {lvl === "ALL" ? "Tất cả" : lvl} ({counts[lvl]})
            </button>
          ))}
        </div>

        {err && (
          <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
            ⚠️ {err}
          </div>
        )}

        <div className="mt-3 max-h-[260px] space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-2">
          {filteredLogs.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Không có dòng nhật ký nào phù hợp bộ lọc.
            </p>
          ) : (
            filteredLogs.map((entry, idx) => (
              <div
                key={`${entry.timestamp_ms}-${idx}`}
                className="flex flex-wrap items-start gap-1.5 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="shrink-0 font-mono text-[11px] text-slate-500">
                  {formatLogTime(entry.timestamp_ms)}
                </span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0 text-[10px] font-bold ${levelBadgeClass(
                    entry.level
                  )}`}
                >
                  {entry.level}
                </span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0 font-mono text-[10px] font-semibold text-slate-700">
                  {entry.category}
                </span>
                <span className="min-w-0 flex-1 break-words text-slate-800">
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
