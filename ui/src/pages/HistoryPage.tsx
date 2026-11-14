import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  LayoutList,
  Loader2,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { HistoryTable } from "../components/HistoryTable";
import { ResultView } from "../components/ResultView";
import { api } from "../lib/api";
import type { AssessmentDetail, AssessmentSummary } from "../lib/types";

type HistoryViewMode = "list" | "table";

const VIEW_MODE_STORAGE_KEY = "englishspeak.history_view_mode";
const PAGE_STEP = 200;

function loadSavedViewMode(): HistoryViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw === "list" || raw === "table") return raw;
  } catch {
    // ignore storage errors
  }
  return "list";
}

export function HistoryPage() {
  const [viewMode, setViewMode] = useState<HistoryViewMode>(() => loadSavedViewMode());
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_STEP);
  const [rows, setRows] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AssessmentDetail | null>(null);
  const [err, setErr] = useState("");

  const requestSeqRef = useRef(0);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const hasMore = rows.length >= limit;

  const refresh = useCallback(async (q: string, nextLimit: number) => {
    const reqId = ++requestSeqRef.current;
    setLoading(true);
    setErr("");
    try {
      const list = await api.listAssessments(q, nextLimit);
      if (reqId === requestSeqRef.current) {
        setRows(list);
      }
    } catch (e) {
      if (reqId === requestSeqRef.current) {
        setErr(String(e));
      }
    } finally {
      if (reqId === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh("", PAGE_STEP);
  }, [refresh]);

  function changeViewMode(mode: HistoryViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }

  function handleQueryChange(val: string) {
    setQuery(val);
    setLimit(PAGE_STEP);
    void refresh(val, PAGE_STEP);
  }

  function handleLoadMore() {
    if (loading || !hasMore) return;
    const nextLimit = limit + PAGE_STEP;
    setLimit(nextLimit);
    void refresh(query, nextLimit);
  }

  function handleListScroll() {
    const el = listScrollRef.current;
    if (!el || loading || !hasMore) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 120) {
      handleLoadMore();
    }
  }

  async function selectItem(id: number, scrollToDetail = false) {
    setErr("");
    try {
      const detail = await api.getAssessment(id);
      setSelected(detail);
      if (scrollToDetail) {
        requestAnimationFrame(() => {
          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    } catch (e) {
      setErr(String(e));
    }
  }

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  function handleDelete(id: number) {
    setDeleteTargetId(id);
  }

  async function executeDelete(id: number) {
    setDeleteTargetId(null);
    try {
      await api.deleteAssessment(id);
      if (selected?.id === id) setSelected(null);
      await refresh(query, limit);
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <div className="space-y-4">
      {/* Unified Search & View Mode Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Tìm theo tên học sinh, video, rubric..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pr-8 pl-9 text-sm focus:border-indigo-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange("")}
                className="absolute top-2 right-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Xóa từ khóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => void refresh(query, limit)}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            title="Tải lại danh sách"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <span className="hidden text-xs font-medium text-slate-500 sm:inline">
            {rows.length}
            {hasMore ? "+" : ""} bản ghi
          </span>
        </div>

        {/* View Mode Switcher */}
        <div
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
          role="group"
          aria-label="Chế độ hiển thị lịch sử"
        >
          <button
            type="button"
            onClick={() => changeViewMode("list")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              viewMode === "list"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Danh sách
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("table")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              viewMode === "table"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            Bảng
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          ⚠️ {err}
        </div>
      )}

      {viewMode === "table" ? (
        <div className="space-y-4">
          <HistoryTable
            rows={rows}
            selectedId={selected?.id ?? null}
            loading={loading}
            hasMore={hasMore}
            onSelect={(id) => void selectItem(id, true)}
            onDelete={(id) => void handleDelete(id)}
            onLoadMore={handleLoadMore}
          />

          {selected && (
            <div ref={detailRef} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Chi tiết bản ghi #{selected.id} — {selected.video_name}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Đóng chi tiết
                </button>
              </div>
              <ResultView
                detail={selected}
                onDetailUpdated={(updated) => {
                  setSelected(updated);
                  void refresh(query, limit);
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-12">
          {/* Left list */}
          <div className="md:sticky md:top-4 md:col-span-5 xl:col-span-4 2xl:col-span-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <div
                ref={listScrollRef}
                onScroll={handleListScroll}
                className="max-h-[calc(100vh-14.5rem)] space-y-2 overflow-y-auto pr-1"
              >
                {rows.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">
                    {loading ? "Đang tải dữ liệu..." : "Chưa có bản ghi lịch sử nào."}
                  </p>
                ) : (
                  rows.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => void selectItem(r.id)}
                        className={`cursor-pointer rounded-xl border p-2.5 transition ${
                          active
                            ? "border-indigo-400 bg-indigo-50/50"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-900">
                              {r.video_name}
                            </div>
                            <div className="mt-0.5 text-xs font-medium text-indigo-700">
                              {r.student_names || `${r.student_count} học sinh`}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {r.rubric_name} · {r.created_at.replace("T", " ")}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                              {r.task_summary}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(r.id);
                            }}
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"
                            title="Xóa bản ghi"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                {hasMore && (
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleLoadMore}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Tải thêm bản ghi
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right detail */}
          <div className="md:col-span-7 xl:col-span-8 2xl:col-span-9">
            {selected ? (
              <ResultView
                detail={selected}
                onDetailUpdated={(updated) => {
                  setSelected(updated);
                  void refresh(query, limit);
                }}
              />
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
                Chọn một lần chấm bên trái để xem chi tiết, gán lại tên học sinh hoặc xuất lại Excel.
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        title={`Xóa bản ghi chấm bài #${deleteTargetId ?? ""}?`}
        description="Bản ghi này sẽ bị xóa vĩnh viễn khỏi lịch sử SQLite và không thể khôi phục."
        confirmLabel="Xóa bản ghi"
        onConfirm={() => {
          if (deleteTargetId !== null) void executeDelete(deleteTargetId);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
