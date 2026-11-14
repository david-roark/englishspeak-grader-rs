import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  FolderOpen,
  Play,
  Sparkles,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import { api } from "../lib/api";
import type { AssessmentDetail, StudentRecord } from "../lib/types";

interface ResultViewProps {
  detail: AssessmentDetail;
  excelPath?: string | null;
  onDetailUpdated?: (updated: AssessmentDetail) => void;
  onSeekVideo?: (timestamp: string) => void;
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString();
}

function StudentCard({
  index,
  record,
  assessmentId,
  onRenamed,
  onSeekVideo,
}: {
  index: number;
  record: StudentRecord;
  assessmentId: number;
  onRenamed: (updated: AssessmentDetail) => void;
  onSeekVideo?: (timestamp: string) => void;
}) {
  const s = record.assessment;
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(s.student_name);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function saveName() {
    if (!draftName.trim()) {
      setErr("Tên không được để trống");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const updated = await api.renameStudent(assessmentId, record.id, draftName.trim());
      onRenamed(updated);
      setEditing(false);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-slate-100 pb-3">
        <div>
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <button
                type="button"
                disabled={saving}
                onClick={saveName}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu tên"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftName(s.student_name);
                  setErr("");
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              {err && <span className="text-xs text-rose-600">{err}</span>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">
                {index + 1}. {s.student_name}
              </h3>
              {s.name_confident ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <UserCheck className="h-3 w-3" />
                  Đã xác định
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  <AlertCircle className="h-3 w-3" />
                  Tên tạm — cần gán lại
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setDraftName(s.student_name);
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                title="Đổi / gán tên học sinh"
              >
                <Edit3 className="h-3 w-3" />
                Gán tên
              </button>
            </div>
          )}
          {record.original_ai_name !== s.student_name && (
            <p className="mt-1 text-xs text-slate-400">
              AI nhận diện ban đầu: {record.original_ai_name}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              Tổng điểm
            </div>
            <div className="text-2xl font-extrabold leading-tight tabular-nums text-indigo-950">
              {fmtScore(s.total_score)}
              <span className="text-sm font-semibold text-indigo-500">
                {" "}
                / {fmtScore(s.max_total_score)}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Xếp loại
            </div>
            <div className="text-base font-bold leading-tight text-slate-900">
              {s.overall_level}
            </div>
          </div>
        </div>
      </div>

      {/* Chi tiết từng tiêu chí với thanh tiến trình trực quan */}
      <div className="mt-4 space-y-2.5">
        {s.criteria.map((c, idx) => {
          const pct =
            c.max_score > 0
              ? Math.max(0, Math.min(100, (c.score / c.max_score) * 100))
              : 0;
          return (
            <div
              key={idx}
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition hover:border-slate-200"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-800">
                  {c.criterion}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-indigo-700">
                  {fmtScore(c.score)}{" "}
                  <span className="text-xs font-medium text-slate-400">
                    / {fmtScore(c.max_score)}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {c.comment && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {c.comment}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Điểm mạnh, điểm yếu, gợi ý, luyện tập */}
      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        <FeedbackList title="Điểm mạnh" items={s.strengths} tone="emerald" />
        <FeedbackList title="Điểm yếu" items={s.weaknesses} tone="rose" />
        <FeedbackList
          title="Gợi ý cải thiện"
          items={s.improvement_suggestions}
          tone="amber"
        />
        <FeedbackList
          title="Hướng luyện tập"
          items={s.practice_directions}
          tone="indigo"
        />
      </div>

      {/* Dẫn chứng */}
      {s.evidence.length > 0 && (
        <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-3.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Dẫn chứng trong video
          </h4>
          <ul className="mt-2 space-y-2 text-sm">
            {s.evidence.map((ev, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => onSeekVideo?.(ev.timestamp)}
                  disabled={!onSeekVideo}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-800 transition hover:bg-indigo-200 disabled:cursor-default disabled:hover:bg-indigo-100"
                  title={onSeekVideo ? "Nhảy tới mốc thời gian trong video" : undefined}
                >
                  <Play className="h-2.5 w-2.5 fill-current" />
                  {ev.timestamp}
                </button>
                <div className="text-slate-700">
                  <span>{ev.quote}</span>{" "}
                  <span className="italic text-slate-500">({ev.note})</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FeedbackList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "rose" | "amber" | "indigo";
}) {
  if (items.length === 0) return null;
  const styles = {
    emerald: "border-emerald-100 bg-emerald-50/50 text-emerald-900",
    rose: "border-rose-100 bg-rose-50/50 text-rose-900",
    amber: "border-amber-100 bg-amber-50/50 text-amber-900",
    indigo: "border-indigo-100 bg-indigo-50/50 text-indigo-900",
  }[tone];

  return (
    <div className={`rounded-lg border p-3.5 ${styles}`}>
      <h4 className="text-xs font-bold uppercase tracking-wide">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
        {items.map((it, idx) => (
          <li key={idx}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function ResultView({
  detail,
  excelPath,
  onDetailUpdated,
  onSeekVideo,
}: ResultViewProps) {
  const [copied, setCopied] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [lastExcel, setLastExcel] = useState<string | null>(excelPath ?? null);

  async function handleCopyMarkdown() {
    const md = await api.getAssessmentMarkdown(detail.id);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExportSaveAs() {
    setExportMsg("");
    const baseName = `${detail.video_name.replace(/\.[^.]+$/, "") || "ket_qua"}.xlsx`;
    const target = await api.saveExcelDialog(baseName);
    if (!target) return;
    try {
      const saved = await api.exportAssessmentExcel(detail.id, target);
      setLastExcel(saved);
      setExportMsg(`✅ Đã lưu Excel: ${saved}`);
    } catch (e) {
      setExportMsg(`⚠️ ${e}`);
    }
  }

  async function handleQuickExport() {
    setExportMsg("");
    try {
      const saved = await api.exportAssessmentExcel(detail.id);
      setLastExcel(saved);
      setExportMsg(`✅ Đã xuất Excel: ${saved}`);
    } catch (e) {
      setExportMsg(`⚠️ ${e}`);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header summary card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-600">
              <Sparkles className="h-4 w-4" />
              <span>
                {detail.rubric_name} · {detail.model} · Ngôn ngữ nói: {detail.detected_language}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {detail.video_name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{detail.task_summary}</p>
            {detail.general_notes && (
              <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">
                <span className="font-semibold">Ghi chú chung:</span> {detail.general_notes}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleQuickExport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Xuất lại Excel
            </button>
            <button
              type="button"
              onClick={handleExportSaveAs}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Lưu thành...
            </button>
            {lastExcel && (
              <button
                type="button"
                onClick={() => api.revealInFolder(lastExcel)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FolderOpen className="h-4 w-4" />
                Mở thư mục Excel
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  Đã copy Markdown
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Markdown
                </>
              )}
            </button>
          </div>
        </div>

        {(exportMsg || lastExcel) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>{exportMsg || `File Excel: ${lastExcel}`}</span>
            {lastExcel && (
              <button
                type="button"
                onClick={() => api.openLocalFile(lastExcel)}
                className="font-semibold text-indigo-600 hover:underline"
              >
                Mở file Excel ngay
              </button>
            )}
          </div>
        )}
      </div>

      {/* Per-student cards */}
      {detail.students.map((rec, idx) => (
        <StudentCard
          key={rec.id}
          index={idx}
          record={rec}
          assessmentId={detail.id}
          onRenamed={(updated) => onDetailUpdated?.(updated)}
          onSeekVideo={onSeekVideo}
        />
      ))}
    </div>
  );
}
