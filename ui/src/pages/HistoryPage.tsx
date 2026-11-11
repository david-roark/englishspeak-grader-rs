import { useEffect, useState } from "react";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { ResultView } from "../components/ResultView";
import { api } from "../lib/api";
import type { AssessmentDetail, AssessmentSummary } from "../lib/types";

export function HistoryPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AssessmentDetail | null>(null);
  const [err, setErr] = useState("");

  async function refresh(q = query) {
    setLoading(true);
    setErr("");
    try {
      const list = await api.listAssessments(q, 100);
      setRows(list);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh("");
  }, []);

  async function selectItem(id: number) {
    setErr("");
    try {
      const detail = await api.getAssessment(id);
      setSelected(detail);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(`Xóa bản ghi chấm bài #${id}?`)) return;
    try {
      await api.deleteAssessment(id);
      if (selected?.id === id) setSelected(null);
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-12">
      {/* Left list */}
      <div className="space-y-3 md:sticky md:top-4 md:col-span-5 xl:col-span-4 2xl:col-span-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  void refresh(val);
                }}
                placeholder="Tìm theo tên học sinh, video, rubric..."
                className="w-full rounded-lg border border-slate-200 py-1.5 pr-3 pl-9 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              title="Tải lại danh sách"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {err && (
            <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              ⚠️ {err}
            </div>
          )}

          <div className="mt-2.5 max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto pr-1">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Chưa có bản ghi lịch sử nào.
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
              void refresh();
            }}
          />
        ) : (
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
            Chọn một lần chấm bên trái để xem chi tiết, gán lại tên học sinh hoặc xuất lại Excel.
          </div>
        )}
      </div>
    </div>
  );
}
