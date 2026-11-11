import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, LANG_LABELS, TASK_LABELS } from "../lib/api";
import type { AppBootstrap, PromptParts, PromptProfile } from "../lib/types";
import { SelectField } from "./SelectField";

interface PromptConfigSectionProps {
  bootstrap: AppBootstrap;
  onBootstrapUpdated: (next: AppBootstrap) => void;
}

const STRICTNESS_OPTIONS = [
  { value: "encouraging", label: "Khuyến khích & sư phạm (chấm nới nhẹ, ưu tiên động viên)" },
  { value: "standard", label: "Tiêu chuẩn & cân bằng (khách quan theo rubric)" },
  { value: "strict", label: "Khắt khe chuẩn thi cử (trừ lỗi hệ thống rõ ràng)" },
];

const TEMP_PRESETS = [
  { value: 0.15, label: "0.15 · Rất nhất quán" },
  { value: 0.25, label: "0.25 · Cân bằng" },
  { value: 0.4, label: "0.40 · Tự nhiên" },
];

function slugifyProfileId(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${ascii || "profile"}_${Date.now().toString().slice(-4)}`;
}

function normalizeRules(rules: string[]): string[] {
  return rules.map((r) => r.trim()).filter(Boolean);
}

export function PromptConfigSection({
  bootstrap,
  onBootstrapUpdated,
}: PromptConfigSectionProps) {
  const [selectedId, setSelectedId] = useState<string>(
    bootstrap.active_prompt_profile_id || bootstrap.prompt_profile.id
  );
  const [draft, setDraft] = useState<PromptProfile>(bootstrap.prompt_profile);
  const [promptMsg, setPromptMsg] = useState("");
  const [promptErr, setPromptErr] = useState("");

  // Clone / new profile inline state
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneTemplate, setCloneTemplate] = useState<"copy" | "strict_exam" | "encouraging">("copy");

  // Live preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRubricId, setPreviewRubricId] = useState(
    bootstrap.rubrics[0]?.id ?? "ielts_speaking"
  );
  const [previewTaskType, setPreviewTaskType] = useState("presentation");
  const [previewLang, setPreviewLang] = useState("vi");
  const [previewNames, setPreviewNames] = useState("Nguyễn Minh Anh, Trần Gia Bảo");
  const [previewExtra, setPreviewExtra] = useState("");
  const [previewData, setPreviewData] = useState<PromptParts | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<"sys" | "user" | null>(null);

  const savedProfile = useMemo(() => {
    return (
      bootstrap.prompt_profiles.find((p) => p.id === selectedId) ??
      bootstrap.prompt_profile
    );
  }, [bootstrap.prompt_profiles, bootstrap.prompt_profile, selectedId]);

  useEffect(() => {
    setDraft(savedProfile);
  }, [savedProfile]);

  const isDirty = useMemo(() => {
    const cleanDraft = { ...draft, grading_rules: normalizeRules(draft.grading_rules) };
    const cleanSaved = {
      ...savedProfile,
      grading_rules: normalizeRules(savedProfile.grading_rules),
    };
    return JSON.stringify(cleanDraft) !== JSON.stringify(cleanSaved);
  }, [draft, savedProfile]);

  const missingNamesPlaceholder = !draft.names_with_list.includes("{names}");
  const missingLangPlaceholder = !draft.grading_rules.some((r) =>
    r.includes("{lang_instr}")
  );

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await api.previewGradingPrompt({
          profile: {
            ...draft,
            grading_rules: normalizeRules(draft.grading_rules),
          },
          rubricId: previewRubricId,
          taskType: previewTaskType,
          feedbackLang: previewLang,
          studentNamesRaw: previewNames,
          extraInstructions: previewExtra,
        });
        if (!cancelled) setPreviewData(res);
      } catch (e) {
        if (!cancelled) setPromptErr(String(e));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    previewOpen,
    draft,
    previewRubricId,
    previewTaskType,
    previewLang,
    previewNames,
    previewExtra,
  ]);

  function handleSelectProfile(nextId: string) {
    if (nextId === selectedId) return;
    if (isDirty && !confirm("Bạn có thay đổi chưa lưu ở profile hiện tại. Chuyển qua profile khác?")) {
      return;
    }
    setPromptMsg("");
    setPromptErr("");
    setSelectedId(nextId);
  }

  async function handleSavePrompt(setActive = false) {
    setPromptMsg("");
    setPromptErr("");
    if (!draft.name.trim()) {
      setPromptErr("Tên Prompt Profile không được để trống.");
      return;
    }
    try {
      const updated = await api.savePromptProfile(
        {
          ...draft,
          name: draft.name.trim(),
          grading_rules: normalizeRules(draft.grading_rules),
        },
        setActive
      );
      onBootstrapUpdated(updated);
      setPromptMsg(
        setActive
          ? `✅ Đã lưu và đặt "${draft.name.trim()}" làm cấu hình chấm mặc định.`
          : "✅ Đã lưu cấu hình prompt! Áp dụng ngay cho lần chấm tiếp theo."
      );
    } catch (e) {
      setPromptErr(String(e));
    }
  }

  async function handleSetActive() {
    setPromptMsg("");
    setPromptErr("");
    try {
      const updated = isDirty
        ? await api.savePromptProfile(
            {
              ...draft,
              name: draft.name.trim(),
              grading_rules: normalizeRules(draft.grading_rules),
            },
            true
          )
        : await api.setActivePromptProfile(draft.id);
      onBootstrapUpdated(updated);
      setPromptMsg(`✅ Đã đặt "${draft.name}" làm cấu hình chấm mặc định.`);
    } catch (e) {
      setPromptErr(String(e));
    }
  }

  async function handleResetPrompt() {
    setPromptMsg("");
    setPromptErr("");
    try {
      const updated = await api.resetPromptProfile();
      setSelectedId("default");
      onBootstrapUpdated(updated);
      setPromptMsg("🔄 Đã khôi phục cấu hình Mặc định.");
    } catch (e) {
      setPromptErr(String(e));
    }
  }

  async function handleCloneCreate() {
    const cleanName = cloneName.trim();
    if (!cleanName) {
      setPromptErr("Vui lòng nhập tên cho profile mới.");
      return;
    }
    setPromptMsg("");
    setPromptErr("");
    const newId = slugifyProfileId(cleanName);
    try {
      let updated = await api.clonePromptProfile(draft.id, newId, cleanName, true);
      if (cloneTemplate !== "copy") {
        const created = updated.prompt_profiles.find((p) => p.id === newId);
        if (created) {
          const tuned: PromptProfile =
            cloneTemplate === "strict_exam"
              ? {
                  ...created,
                  strictness: "strict",
                  temperature: 0.15,
                  system_instruction:
                    "Bạn là giám khảo chấm thi chứng chỉ nói tiếng Anh quốc tế (IELTS/TOEFL/Cambridge), chấm điểm chặt chẽ và chuẩn xác theo tiêu chí học thuật.",
                }
              : {
                  ...created,
                  strictness: "encouraging",
                  temperature: 0.3,
                  system_instruction:
                    "Bạn là giáo viên tiếng Anh tận tâm, đánh giá công bằng đồng thời khích lệ sự tự tin và gợi ý cách sửa gần gũi, dễ thực hành cho học sinh.",
                };
          updated = await api.savePromptProfile(tuned, true);
        }
      }
      onBootstrapUpdated(updated);
      setSelectedId(newId);
      setCloneOpen(false);
      setCloneName("");
      setPromptMsg(`✅ Đã tạo và kích hoạt profile mới "${cleanName}".`);
    } catch (e) {
      setPromptErr(String(e));
    }
  }

  async function handleDeleteProfile() {
    if (draft.id === "default") return;
    if (!confirm(`Xóa Prompt Profile "${draft.name}"?`)) return;
    setPromptMsg("");
    setPromptErr("");
    try {
      const updated = await api.deletePromptProfile(draft.id);
      setSelectedId(updated.active_prompt_profile_id || "default");
      onBootstrapUpdated(updated);
      setPromptMsg(`🗑️ Đã xóa profile "${draft.name}".`);
    } catch (e) {
      setPromptErr(String(e));
    }
  }

  function updateRule(idx: number, value: string) {
    const next = [...draft.grading_rules];
    next[idx] = value;
    setDraft({ ...draft, grading_rules: next });
  }

  function moveRule(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= draft.grading_rules.length) return;
    const next = [...draft.grading_rules];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, grading_rules: next });
  }

  function removeRule(idx: number) {
    const next = draft.grading_rules.filter((_, i) => i !== idx);
    setDraft({ ...draft, grading_rules: next });
  }

  function addRule(presetText = "") {
    setDraft({ ...draft, grading_rules: [...draft.grading_rules, presetText] });
  }

  async function copyText(key: "sys" | "user", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  }

  const isActiveProfile = draft.id === bootstrap.active_prompt_profile_id;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Cấu hình Prompt gửi Gemini AI
            </h2>
            {isDirty && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                ● Chưa lưu thay đổi
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Tùy chỉnh nhiều profile theo lớp/kỳ thi; tách riêng{" "}
            <code>systemInstruction</code>, mức độ khắt khe, độ ổn định điểm và xem trước prompt thực tế.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              previewOpen
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {previewOpen ? "Ẩn xem trước" : "Xem trước Prompt"}
          </button>

          {draft.id === "default" ? (
            <button
              type="button"
              onClick={handleResetPrompt}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Khôi phục mặc định
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDeleteProfile}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xóa profile
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleSavePrompt(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            <Save className="h-3.5 w-3.5" />
            Lưu cấu hình prompt
          </button>
        </div>
      </div>

      {/* Multi-profile selector & clone bar */}
      <div className="mt-3.5 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Chọn Profile đang chỉnh
            </label>
            <SelectField
              value={selectedId}
              onChange={handleSelectProfile}
              options={bootstrap.prompt_profiles.map((p) => ({
                value: p.id,
                label: p.name,
                badge:
                  p.id === bootstrap.active_prompt_profile_id
                    ? "Đang chấm"
                    : p.id === "default"
                    ? "Mặc định"
                    : "Tùy chỉnh",
              }))}
              size="sm"
              className="mt-1 w-full"
              ariaLabel="Chọn Prompt Profile"
            />
          </div>

          <div className="lg:col-span-4">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Tên Profile
            </label>
            <input
              type="text"
              value={draft.name}
              disabled={draft.id === "default"}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm disabled:opacity-65"
            />
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-3">
            {!isActiveProfile ? (
              <button
                type="button"
                onClick={handleSetActive}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Check className="h-3.5 w-3.5" />
                Đặt làm mặc định
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                Đang dùng để chấm
              </span>
            )}
            <button
              type="button"
              onClick={() => setCloneOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo mới
            </button>
          </div>
        </div>
      </div>

      {cloneOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="min-w-[200px] flex-1">
            <label className="block text-xs font-semibold text-slate-700">
              Tên Profile mới
            </label>
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder="VD: Luyện thi IELTS khắt khe"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="min-w-[220px]">
            <label className="block text-xs font-semibold text-slate-700">
              Khởi tạo từ mẫu
            </label>
            <SelectField
              value={cloneTemplate}
              onChange={(v) => setCloneTemplate(v as typeof cloneTemplate)}
              options={[
                { value: "copy", label: "Nhân bản từ profile hiện tại" },
                { value: "strict_exam", label: "Mẫu Luyện thi khắt khe (Temp 0.15)" },
                { value: "encouraging", label: "Mẫu Khuyến khích học sinh (Temp 0.30)" },
              ]}
              size="sm"
              className="mt-1 w-full"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCloneCreate}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
            >
              Tạo &amp; kích hoạt
            </button>
            <button
              type="button"
              onClick={() => setCloneOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {promptErr && (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          ⚠️ {promptErr}
        </div>
      )}
      {promptMsg && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {promptMsg}
        </div>
      )}

      {/* Calibration Row: Strictness & Temperature */}
      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Mức độ khắt khe khi chấm
          </label>
          <SelectField
            value={draft.strictness}
            onChange={(val) => setDraft({ ...draft, strictness: val })}
            options={STRICTNESS_OPTIONS}
            size="sm"
            className="mt-1 w-full"
            ariaLabel="Mức độ khắt khe khi chấm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-700">
              Độ ổn định điểm (Temperature)
            </label>
            <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
              {draft.temperature.toFixed(2)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={draft.temperature}
              onChange={(e) =>
                setDraft({ ...draft, temperature: Number(e.target.value) })
              }
              className="min-w-[120px] flex-1 accent-indigo-600"
            />
            <div className="flex flex-wrap gap-1">
              {TEMP_PRESETS.map((tp) => {
                const active = Math.abs(draft.temperature - tp.value) < 0.01;
                return (
                  <button
                    key={tp.value}
                    type="button"
                    onClick={() => setDraft({ ...draft, temperature: tp.value })}
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      active
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {tp.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Fields */}
      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <div className="space-y-3.5 xl:col-span-7">
          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Vai trò &amp; Nhiệm vụ hệ thống (<code>systemInstruction</code>)
            </label>
            <textarea
              rows={3}
              value={draft.system_instruction}
              onChange={(e) =>
                setDraft({ ...draft, system_instruction: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Chỉ dẫn khi có danh sách tên học sinh (biến <code>{"{names}"}</code>)
            </label>
            <textarea
              rows={2}
              value={draft.names_with_list}
              onChange={(e) =>
                setDraft({ ...draft, names_with_list: e.target.value })
              }
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                missingNamesPlaceholder
                  ? "border-amber-400 focus:border-amber-500"
                  : "border-slate-200 focus:border-indigo-400"
              }`}
            />
            {missingNamesPlaceholder && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Đang thiếu biến <code>{"{names}"}</code> — danh sách tên giáo viên nhập sẽ không được đưa vào prompt.
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      names_with_list: `${draft.names_with_list.trim()} {names}`.trim(),
                    })
                  }
                  className="rounded border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-900 hover:bg-amber-100"
                >
                  + Chèn {"{names}"}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Chỉ dẫn khi AI tự phát hiện tên học sinh
            </label>
            <textarea
              rows={3}
              value={draft.names_auto_detect}
              onChange={(e) =>
                setDraft({ ...draft, names_auto_detect: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          {/* Structured Grading Rules */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Yêu cầu chấm bài chi tiết ({draft.grading_rules.length} quy tắc, hỗ trợ{" "}
                <code>{"{lang_instr}"}</code>)
              </label>
              <button
                type="button"
                onClick={() => addRule("")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3 w-3" />
                Thêm yêu cầu
              </button>
            </div>

            <div className="mt-1.5 space-y-1.5">
              {draft.grading_rules.map((rule, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="mt-2 w-5 shrink-0 text-right font-mono text-[11px] font-semibold text-slate-400">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={rule}
                    onChange={(e) => updateRule(idx, e.target.value)}
                    placeholder="Nhập một yêu cầu chấm bài..."
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none"
                  />
                  <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveRule(idx, -1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Đưa lên"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draft.grading_rules.length - 1}
                      onClick={() => moveRule(idx, 1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Đưa xuống"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRule(idx)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {missingLangPlaceholder && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                <span>
                  Chưa có dòng chứa <code>{"{lang_instr}"}</code> — hệ thống sẽ tự nối thêm vào cuối danh sách yêu cầu.
                </span>
                <button
                  type="button"
                  onClick={() => addRule("NGÔN NGỮ NHẬN XÉT: {lang_instr}")}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  + Chèn {"{lang_instr}"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/40 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Mô tả theo Loại bài nói
            </h3>
            {Object.entries(TASK_LABELS).map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-slate-600">
                  {label}
                </label>
                <input
                  type="text"
                  value={draft.task_types[k] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      task_types: { ...draft.task_types, [k]: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            ))}
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/40 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Chỉ dẫn theo Ngôn ngữ nhận xét
            </h3>
            {Object.entries(LANG_LABELS).map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-slate-600">
                  {label}
                </label>
                <input
                  type="text"
                  value={draft.feedback_languages[k] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      feedback_languages: {
                        ...draft.feedback_languages,
                        [k]: e.target.value,
                      },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Prompt Preview Drawer */}
      {previewOpen && (
        <div className="mt-5 space-y-3 rounded-xl border border-indigo-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Xem trước Prompt thực tế gửi Gemini
              </h3>
              <p className="text-[11px] text-slate-500">
                Tự động cập nhật từ bản nháp hiện tại và cấu trúc thực tế của Rust backend.
              </p>
            </div>
            {previewLoading && (
              <span className="text-[11px] font-medium text-indigo-600">
                Đang cập nhật...
              </span>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Rubric thử
              </label>
              <SelectField
                value={previewRubricId}
                onChange={setPreviewRubricId}
                options={bootstrap.rubrics.map((r) => ({ value: r.id, label: r.name }))}
                size="xs"
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Loại bài
              </label>
              <SelectField
                value={previewTaskType}
                onChange={setPreviewTaskType}
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
                Ngôn ngữ
              </label>
              <SelectField
                value={previewLang}
                onChange={setPreviewLang}
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
                Tên HS mẫu (để trống = tự detect)
              </label>
              <input
                type="text"
                value={previewNames}
                onChange={(e) => setPreviewNames(e.target.value)}
                placeholder="VD: An, Bình"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Yêu cầu bổ sung mẫu
              </label>
              <input
                type="text"
                value={previewExtra}
                onChange={(e) => setPreviewExtra(e.target.value)}
                placeholder="VD: Chú trọng ending sounds"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              />
            </div>
          </div>

          {previewData && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                    1. systemInstruction (System Role)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText("sys", previewData.system_instruction)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {copiedKey === "sys" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Chép
                      </>
                    )}
                  </button>
                </div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-700">
                  {previewData.system_instruction || "(Trống)"}
                </pre>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                    2. contents[0].parts (User Prompt + Rubric)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText("user", previewData.user_prompt)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {copiedKey === "user" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Chép
                      </>
                    )}
                  </button>
                </div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-700">
                  {previewData.user_prompt}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
