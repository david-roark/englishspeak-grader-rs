import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  Loader2,
  Trash2,
} from "lucide-react";
import { LANG_LABELS, TASK_LABELS } from "../lib/api";
import type { AssessmentSummary } from "../lib/types";

type SortKey =
  | "id"
  | "video_name"
  | "student_names"
  | "rubric_name"
  | "model"
  | "created_at";

type SortDir = "asc" | "desc";

interface HistoryTableProps {
  rows: AssessmentSummary[];
  selectedId: number | null;
  loading: boolean;
  hasMore: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onLoadMore: () => void;
}

function formatDurationMs(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m${s}s`;
}

export function HistoryTable({
  rows,
  selectedId,
  loading,
  hasMore,
  onSelect,
  onDelete,
  onLoadMore,
}: HistoryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = a.id - b.id;
          break;
        case "video_name":
          cmp = a.video_name.localeCompare(b.video_name, "vi");
          break;
        case "student_names":
          cmp = (a.student_names || "").localeCompare(b.student_names || "", "vi");
          break;
        case "rubric_name":
          cmp = a.rubric_name.localeCompare(b.rubric_name, "vi");
          break;
        case "model":
          cmp = a.model.localeCompare(b.model);
          break;
        case "created_at":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "id" || key === "created_at" ? "desc" : "asc");
    }
  }

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el || loading || !hasMore) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 120) {
      onLoadMore();
    }
  }

  function renderSortHeader(label: string, key: SortKey, alignRight = false) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide transition-colors hover:text-indigo-700 ${
          alignRight ? "justify-end" : ""
        } ${active ? "text-indigo-700" : "text-slate-600"}`}
      >
        <span>{label}</span>
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" />
        )}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="max-h-[calc(100vh-14.5rem)] overflow-auto"
      >
        <table className="w-full min-w-[880px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 shadow-2xs">
            <tr className="text-[11px]">
              <th className="w-14 px-3 py-2.5">{renderSortHeader("#", "id")}</th>
              <th className="min-w-[210px] px-3 py-2.5">
                {renderSortHeader("Video / Tóm tắt", "video_name")}
              </th>
              <th className="min-w-[160px] px-3 py-2.5">
                {renderSortHeader("Học sinh", "student_names")}
              </th>
              <th className="min-w-[140px] px-3 py-2.5">
                {renderSortHeader("Rubric", "rubric_name")}
              </th>
              <th className="min-w-[130px] px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-600">
                Loại / Ngôn ngữ
              </th>
              <th className="min-w-[130px] px-3 py-2.5">
                {renderSortHeader("Model", "model")}
              </th>
              <th className="min-w-[140px] px-3 py-2.5">
                {renderSortHeader("Thời gian chấm", "created_at")}
              </th>
              <th className="w-24 px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-600">
                Thao tác
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-xs text-slate-400">
                  {loading ? "Đang tải dữ liệu..." : "Không tìm thấy bản ghi lịch sử nào."}
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => {
                const active = selectedId === r.id;
                const procTime = formatDurationMs(r.duration_ms);
                return (
                  <tr
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className={`cursor-pointer transition-colors ${
                      active
                        ? "bg-indigo-50/70"
                        : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="px-3 py-2.5 align-top font-mono text-[11px] font-semibold text-slate-500">
                      #{r.id}
                    </td>

                    <td className="max-w-[280px] px-3 py-2.5 align-top">
                      <div
                        className={`truncate text-xs font-bold ${
                          active ? "text-indigo-800" : "text-slate-900"
                        }`}
                        title={r.video_name}
                      >
                        {r.video_name}
                      </div>
                      {r.task_summary && (
                        <p
                          className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500"
                          title={r.task_summary}
                        >
                          {r.task_summary}
                        </p>
                      )}
                    </td>

                    <td className="max-w-[220px] px-3 py-2.5 align-top">
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {r.student_count} HS
                        </span>
                        <span
                          className="line-clamp-2 font-medium text-slate-800"
                          title={r.student_names || `${r.student_count} học sinh`}
                        >
                          {r.student_names || `${r.student_count} học sinh`}
                        </span>
                      </div>
                    </td>

                    <td className="max-w-[180px] px-3 py-2.5 align-top">
                      <span
                        className="line-clamp-2 font-medium text-slate-700"
                        title={r.rubric_name}
                      >
                        {r.rubric_name}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 align-top text-[11px] text-slate-600">
                      <div className="truncate font-medium">
                        {TASK_LABELS[r.task_type] ?? r.task_type}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {LANG_LABELS[r.feedback_lang] ?? r.feedback_lang}
                      </div>
                    </td>

                    <td className="max-w-[160px] px-3 py-2.5 align-top">
                      <span
                        className="inline-block max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700"
                        title={r.model}
                      >
                        {r.model}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-[11px] text-slate-600">
                      <div className="font-mono">{r.created_at.replace("T", " ")}</div>
                      {procTime && (
                        <div className="text-[10px] text-slate-400">Xử lý: {procTime}</div>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right align-top">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(r.id);
                          }}
                          className={`rounded-md p-1.5 transition-colors ${
                            active
                              ? "bg-indigo-600 text-white"
                              : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                          }`}
                          title="Xem chi tiết"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(r.id);
                          }}
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          title="Xóa bản ghi"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {hasMore && (
          <div className="flex items-center justify-center border-t border-slate-100 bg-slate-50/60 py-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={onLoadMore}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Tải thêm bản ghi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
