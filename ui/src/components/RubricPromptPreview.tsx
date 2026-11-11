import { useEffect, useState } from "react";
import { Check, Copy, Eye, Loader2, X } from "lucide-react";
import { api, LANG_LABELS, TASK_LABELS } from "../lib/api";
import type { PromptParts, PromptProfile, Rubric } from "../lib/types";
import { SelectField } from "./SelectField";

interface RubricPromptPreviewProps {
  selectedRubric: Rubric | undefined;
  draftRubric: Rubric;
  draftHasCriteria: boolean;
  promptProfiles: PromptProfile[];
  activePromptProfileId: string;
  onClose: () => void;
}

export function RubricPromptPreview({
  selectedRubric,
  draftRubric,
  draftHasCriteria,
  promptProfiles,
  activePromptProfileId,
  onClose,
}: RubricPromptPreviewProps) {
  const [sourceMode, setSourceMode] = useState<"selected" | "draft">(
    draftHasCriteria ? "draft" : "selected"
  );
  const [profileId, setProfileId] = useState(
    activePromptProfileId || promptProfiles[0]?.id || "default"
  );
  const [taskType, setTaskType] = useState("presentation");
  const [feedbackLang, setFeedbackLang] = useState("vi");
  const [studentNames, setStudentNames] = useState("Nguyễn Minh Anh, Trần Gia Bảo");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [parts, setParts] = useState<PromptParts | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copiedKey, setCopiedKey] = useState<"sys" | "user" | "all" | null>(null);

  const effectiveSource =
    sourceMode === "draft" && draftHasCriteria ? draftRubric : selectedRubric;

  useEffect(() => {
    if (!effectiveSource) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await api.previewGradingPrompt({
          profileId,
          rubric: effectiveSource,
          taskType,
          feedbackLang,
          studentNamesRaw: studentNames,
          extraInstructions,
        });
        if (!cancelled) setParts(res);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    effectiveSource,
    profileId,
    taskType,
    feedbackLang,
    studentNames,
    extraInstructions,
  ]);

  async function copyText(key: "sys" | "user" | "all", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Eye className="h-4 w-4 text-indigo-600" />
            Xem trước mẫu Prompt sẽ gửi cho Gemini AI
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Kiểm tra chính xác nội dung rubric (cách tính điểm, trọng số, mô tả mức đạt) khi ghép vào prompt thật.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loading && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang dựng prompt...
            </span>
          )}
          {parts && (
            <button
              type="button"
              onClick={() =>
                copyText(
                  "all",
                  `${parts.system_instruction}\n\n${parts.user_prompt}`.trim()
                )
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copiedKey === "all" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Đã chép toàn bộ
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Chép toàn bộ
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" />
            Đóng
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Nguồn Rubric xem trước
          </label>
          <SelectField
            value={sourceMode}
            onChange={(v) => setSourceMode(v as "selected" | "draft")}
            options={[
              {
                value: "selected",
                label: selectedRubric
                  ? `Đang chọn: ${selectedRubric.name}`
                  : "Rubric đang chọn",
              },
              {
                value: "draft",
                label: draftHasCriteria
                  ? `Bản nháp đang sửa: ${draftRubric.name || "(Chưa đặt tên)"}`
                  : "Bản nháp (chưa có tiêu chí)",
                disabled: !draftHasCriteria,
              },
            ]}
            size="xs"
            className="mt-1 w-full"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Cấu hình Prompt
          </label>
          <SelectField
            value={profileId}
            onChange={setProfileId}
            options={promptProfiles.map((p) => ({
              value: p.id,
              label: p.name,
              badge: p.id === activePromptProfileId ? "Mặc định" : undefined,
            }))}
            size="xs"
            className="mt-1 w-full"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Loại bài nói
          </label>
          <SelectField
            value={taskType}
            onChange={setTaskType}
            options={Object.entries(TASK_LABELS).map(([k, label]) => ({
              value: k,
              label,
            }))}
            size="xs"
            className="mt-1 w-full"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Ngôn ngữ nhận xét
          </label>
          <SelectField
            value={feedbackLang}
            onChange={setFeedbackLang}
            options={Object.entries(LANG_LABELS).map(([k, label]) => ({
              value: k,
              label,
            }))}
            size="xs"
            className="mt-1 w-full"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Tên học sinh mẫu
          </label>
          <input
            type="text"
            value={studentNames}
            onChange={(e) => setStudentNames(e.target.value)}
            placeholder="Trống = AI tự phát hiện"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Yêu cầu bổ sung mẫu
          </label>
          <input
            type="text"
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            placeholder="VD: Chú ý âm cuối -s/-ed"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          ⚠️ {err}
        </div>
      )}

      {parts && (
        <div className="mt-3 grid gap-3 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 lg:col-span-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                1. systemInstruction
              </span>
              <button
                type="button"
                onClick={() => copyText("sys", parts.system_instruction)}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                {copiedKey === "sys" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedKey === "sys" ? "Đã chép" : "Chép"}
              </button>
            </div>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-700">
              {parts.system_instruction || "(Trống)"}
            </pre>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 lg:col-span-8">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                2. Nội dung Prompt chấm bài (gồm Rubric chi tiết gửi AI)
              </span>
              <button
                type="button"
                onClick={() => copyText("user", parts.user_prompt)}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                {copiedKey === "user" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedKey === "user" ? "Đã chép" : "Chép"}
              </button>
            </div>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-700">
              {parts.user_prompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
