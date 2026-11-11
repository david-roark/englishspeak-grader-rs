import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit,
  Eye,
  EyeOff,
  Layers,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { RubricPromptPreview } from "../components/RubricPromptPreview";
import { SelectField } from "../components/SelectField";
import { api } from "../lib/api";
import {
  buildThreeLevelTemplate,
  computeRubricMaxTotal,
  formatRubricScoringSummary,
  formatScoreNum,
  getCriterionWeight,
  getTotalWeight,
  slugifyRubricId,
} from "../lib/rubricUtils";
import type {
  Criterion,
  CriterionLevel,
  PromptProfile,
  Rubric,
} from "../lib/types";

interface RubricsPageProps {
  rubrics: Rubric[];
  promptProfiles: PromptProfile[];
  activePromptProfileId: string;
  onRubricsChanged: (next: Rubric[]) => void;
}

const SCORING_MODE_OPTIONS = [
  {
    value: "sum",
    label: "Cộng tổng điểm các tiêu chí",
    badge: "Tổng",
  },
  {
    value: "weighted_avg",
    label: "Trung bình có trọng số (quy về thang mục tiêu)",
    badge: "TB%",
  },
];

const ROUNDING_OPTIONS = [
  { value: "", label: "Không làm tròn (2 chữ số thập phân)" },
  { value: "0.5", label: "Làm tròn bước 0.5 (chuẩn IELTS / phổ thông)" },
  { value: "0.25", label: "Làm tròn bước 0.25" },
  { value: "0.1", label: "Làm tròn bước 0.1" },
  { value: "1", label: "Làm tròn số nguyên (bước 1)" },
];

const emptyCriterion = (): Criterion => ({
  name: "",
  description: "",
  min_score: 0,
  max_score: 10,
  weight: 1,
  levels: [],
});

function parseNumberOr(raw: string, fallback: number): number {
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function RubricsPage({
  rubrics,
  promptProfiles,
  activePromptProfileId,
  onRubricsChanged,
}: RubricsPageProps) {
  const [selectedId, setSelectedId] = useState<string>(rubrics[0]?.id ?? "");

  // Editor mode & form state
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [customIdEnabled, setCustomIdEnabled] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scaleNote, setScaleNote] = useState("");
  const [scoringMode, setScoringMode] = useState<"sum" | "weighted_avg">("weighted_avg");
  const [targetScale, setTargetScale] = useState<number>(10);
  const [roundingStep, setRoundingStep] = useState<string>("0.5");
  const [criteria, setCriteria] = useState<Criterion[]>([
    { ...emptyCriterion(), name: "Nội dung & Ý tưởng", weight: 30 },
    { ...emptyCriterion(), name: "Từ vựng & Ngữ pháp", weight: 30 },
    { ...emptyCriterion(), name: "Phát âm & Ngữ điệu", weight: 20 },
    { ...emptyCriterion(), name: "Trôi chảy & Tương tác", weight: 20 },
  ]);
  const [expandedLevels, setExpandedLevels] = useState<Record<number, boolean>>({});

  // UI feedback & prompt preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = rubrics.find((r) => r.id === selectedId) ?? rubrics[0];

  const draftRubric: Rubric = useMemo(() => {
    const cleanCriteria = criteria
      .filter((c) => c.name.trim() !== "")
      .map((c) => ({
        name: c.name.trim(),
        description: c.description.trim(),
        min_score: Number.isFinite(c.min_score) ? c.min_score : 0,
        max_score: Number.isFinite(c.max_score) ? c.max_score : 10,
        weight: getCriterionWeight(c),
        levels: (c.levels ?? []).filter(
          (l) => l.label.trim() !== "" || l.description.trim() !== ""
        ),
      }));

    return {
      id: (id || slugifyRubricId(name)).trim() || "rubric_moi",
      name: name.trim() || "Rubric mới",
      description: description.trim(),
      scale_note: scaleNote.trim(),
      is_builtin: false,
      scoring_mode: scoringMode,
      target_scale:
        scoringMode === "weighted_avg" && Number.isFinite(targetScale) && targetScale > 0
          ? targetScale
          : null,
      rounding_step: roundingStep ? Number(roundingStep) : null,
      criteria: cleanCriteria,
    };
  }, [id, name, description, scaleNote, scoringMode, targetScale, roundingStep, criteria]);

  const draftMaxTotal = useMemo(
    () => computeRubricMaxTotal(draftRubric),
    [draftRubric]
  );
  const totalWeight = useMemo(() => getTotalWeight(criteria), [criteria]);

  function loadForEdit(r: Rubric) {
    setMsg("");
    setErr("");
    setEditingOriginalId(r.id);
    setCustomIdEnabled(true);
    setId(r.id);
    setName(r.name);
    setDescription(r.description);
    setScaleNote(r.scale_note);
    setScoringMode(r.scoring_mode === "weighted_avg" ? "weighted_avg" : "sum");
    setTargetScale(
      typeof r.target_scale === "number" && r.target_scale > 0
        ? r.target_scale
        : 10
    );
    setRoundingStep(
      typeof r.rounding_step === "number" && r.rounding_step > 0
        ? String(r.rounding_step)
        : ""
    );
    setCriteria(
      r.criteria.map((c) => ({
        ...c,
        weight: getCriterionWeight(c),
        levels: (c.levels ?? []).map((l) => ({ ...l })),
      }))
    );
    setExpandedLevels({});
  }

  function resetForm() {
    setEditingOriginalId(null);
    setCustomIdEnabled(false);
    setId("");
    setName("");
    setDescription("");
    setScaleNote("");
    setScoringMode("weighted_avg");
    setTargetScale(10);
    setRoundingStep("0.5");
    setCriteria([
      { ...emptyCriterion(), name: "Nội dung & Ý tưởng", weight: 30 },
      { ...emptyCriterion(), name: "Từ vựng & Ngữ pháp", weight: 30 },
      { ...emptyCriterion(), name: "Phát âm & Ngữ điệu", weight: 20 },
      { ...emptyCriterion(), name: "Trôi chảy & Tương tác", weight: 20 },
    ]);
    setExpandedLevels({});
    setMsg("");
    setErr("");
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!editingOriginalId && !customIdEnabled) {
      setId(val.trim() ? slugifyRubricId(val) : "");
    }
  }

  async function handleSave() {
    setMsg("");
    setErr("");
    const effectiveId = (id || slugifyRubricId(name)).trim();
    if (!effectiveId || !name.trim()) {
      setErr("Cần nhập tên hiển thị (và mã rubric).");
      return;
    }
    if (draftRubric.criteria.length === 0) {
      setErr("Cần ít nhất 1 tiêu chí có tên.");
      return;
    }

    setSaving(true);
    try {
      const updated = await api.saveCustomRubric({
        ...draftRubric,
        id: effectiveId,
      });
      onRubricsChanged(updated);
      setSelectedId(effectiveId);
      setEditingOriginalId(effectiveId);
      setId(effectiveId);
      setMsg(
        `✅ Đã lưu rubric '${name.trim()}' (${draftRubric.criteria.length} tiêu chí, ${formatRubricScoringSummary(
          draftRubric
        )}).`
      );
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleClone(r: Rubric) {
    const suggestedId = `${r.id}_copy_${Date.now().toString().slice(-4)}`;
    const suggestedName = `${r.name} (Bản sao)`;
    setMsg("");
    setErr("");
    try {
      const updated = await api.cloneRubric(r.id, suggestedId, suggestedName);
      onRubricsChanged(updated);
      setSelectedId(suggestedId);
      const cloned = updated.find((x) => x.id === suggestedId);
      if (cloned) loadForEdit(cloned);
      setMsg(
        `✅ Đã nhân bản '${r.name}' thành '${suggestedName}'. Bạn có thể chỉnh sửa bên phải.`
      );
    } catch (e) {
      setErr(String(e));
    }
  }

  async function handleDelete(r: Rubric) {
    if (!confirm(`Xóa rubric tùy chỉnh "${r.name}"?`)) return;
    setMsg("");
    setErr("");
    try {
      const updated = await api.deleteCustomRubric(r.id);
      onRubricsChanged(updated);
      if (selectedId === r.id) {
        setSelectedId(updated[0]?.id ?? "");
      }
      if (editingOriginalId === r.id) {
        resetForm();
      }
      setMsg(`✅ Đã xóa rubric '${r.name}'.`);
    } catch (e) {
      setErr(String(e));
    }
  }

  function updateRow(idx: number, patch: Partial<Criterion>) {
    setCriteria((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  }

  function moveRow(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= criteria.length) return;
    setCriteria((prev) => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
    setExpandedLevels({});
  }

  function updateLevel(
    cIdx: number,
    lIdx: number,
    patch: Partial<CriterionLevel>
  ) {
    setCriteria((prev) =>
      prev.map((row, i) => {
        if (i !== cIdx) return row;
        const nextLevels = [...(row.levels ?? [])];
        nextLevels[lIdx] = { ...nextLevels[lIdx], ...patch };
        return { ...row, levels: nextLevels };
      })
    );
  }

  function addLevel(cIdx: number) {
    setCriteria((prev) =>
      prev.map((row, i) => {
        if (i !== cIdx) return row;
        return {
          ...row,
          levels: [
            ...(row.levels ?? []),
            { label: "", score_range: "", description: "" },
          ],
        };
      })
    );
    setExpandedLevels((prev) => ({ ...prev, [cIdx]: true }));
  }

  function applyLevelTemplate(cIdx: number) {
    setCriteria((prev) =>
      prev.map((row, i) =>
        i === cIdx
          ? {
              ...row,
              levels: buildThreeLevelTemplate(row.min_score, row.max_score),
            }
          : row
      )
    );
    setExpandedLevels((prev) => ({ ...prev, [cIdx]: true }));
  }

  function removeLevel(cIdx: number, lIdx: number) {
    setCriteria((prev) =>
      prev.map((row, i) => {
        if (i !== cIdx) return row;
        return {
          ...row,
          levels: (row.levels ?? []).filter((_, j) => j !== lIdx),
        };
      })
    );
  }

  return (
    <div className="space-y-4">
      {previewOpen && (
        <RubricPromptPreview
          selectedRubric={selected}
          draftRubric={draftRubric}
          draftHasCriteria={draftRubric.criteria.length > 0}
          promptProfiles={promptProfiles}
          activePromptProfileId={activePromptProfileId}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <div className="grid items-start gap-4 md:grid-cols-12">
        {/* Left: List & selected details */}
        <div className="space-y-3 md:col-span-5 xl:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Danh sách Rubric ({rubrics.length})
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Tạo mới
              </button>
            </div>

            <div className="mt-2.5 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
              {rubrics.map((r) => {
                const active = selected?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer rounded-xl border p-3 transition ${
                      active
                        ? "border-indigo-400 bg-indigo-50/50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-slate-900">
                            {r.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              r.is_builtin
                                ? "bg-slate-100 text-slate-600"
                                : "bg-indigo-100 text-indigo-700"
                            }`}
                          >
                            {r.is_builtin ? "Mặc định" : "Tùy chỉnh"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {r.criteria.length} tiêu chí ·{" "}
                          <span className="font-medium text-indigo-700">
                            {formatRubricScoringSummary(r)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleClone(r);
                          }}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600"
                          title="Nhân bản để tùy chỉnh từ mẫu này"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {!r.is_builtin && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                loadForEdit(r);
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600"
                              title="Chỉnh sửa rubric này"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(r);
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-rose-600"
                              title="Xóa rubric"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected rubric details */}
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Chi tiết: {selected.name}
                  </h3>
                  <div className="mt-0.5 text-[11px] font-medium text-indigo-700">
                    {formatRubricScoringSummary(selected)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  <Eye className="h-3 w-3" />
                  Xem Prompt gửi AI
                </button>
              </div>

              {selected.description && (
                <p className="mt-2 text-xs text-slate-600">{selected.description}</p>
              )}
              {selected.scale_note && (
                <p className="mt-1 text-xs italic text-slate-500">
                  Thang điểm: {selected.scale_note}
                </p>
              )}

              <table className="mt-3 w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-1.5">Tiêu chí</th>
                    <th className="py-1.5">Mô tả</th>
                    {selected.scoring_mode === "weighted_avg" && (
                      <th className="w-14 py-1.5 text-right">Trọng số</th>
                    )}
                    <th className="w-14 py-1.5 text-right">Điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selected.criteria.map((c, i) => {
                    const selTotalW = getTotalWeight(selected.criteria);
                    const pct = Math.round((getCriterionWeight(c) / selTotalW) * 100);
                    return (
                      <tr key={i}>
                        <td className="py-2 pr-2 align-top font-semibold text-slate-800">
                          {c.name}
                        </td>
                        <td className="py-2 pr-2 align-top text-slate-600">
                          <div>{c.description}</div>
                          {c.levels && c.levels.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                              {c.levels.map((lv, li) => (
                                <li key={li}>
                                  <span className="font-semibold text-slate-700">
                                    • {lv.label}
                                    {lv.score_range ? ` (${lv.score_range})` : ""}:
                                  </span>{" "}
                                  {lv.description}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        {selected.scoring_mode === "weighted_avg" && (
                          <td className="py-2 pr-2 text-right align-top font-mono text-[11px] text-slate-500">
                            {pct}%
                          </td>
                        )}
                        <td className="py-2 text-right align-top font-medium text-indigo-700">
                          {formatScoreNum(c.min_score)}–{formatScoreNum(c.max_score)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Create / Edit Form */}
        <div className="md:col-span-7 xl:col-span-8">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    {editingOriginalId
                      ? `Đang chỉnh sửa: ${name || editingOriginalId}`
                      : "Tạo Rubric mới"}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      editingOriginalId
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {editingOriginalId ? "Chế độ chỉnh sửa" : "Tạo mới"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Thiết kế tiêu chí, trọng số, mô tả các mức đạt và cách quy điểm tổng phù hợp cho lớp học.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  previewOpen
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {previewOpen ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {previewOpen ? "Ẩn xem trước Prompt" : "Xem trước Prompt gửi AI"}
              </button>
            </div>

            {/* Name + Optional Slug ID */}
            <div className="mt-4 grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-7">
                <label className="block text-xs font-semibold text-slate-600">
                  Tên hiển thị Rubric
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="VD: Kiểm tra nói Giữa kỳ Lớp 10 (thang 10)"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Mã định danh (tự động)
                  </label>
                  {!editingOriginalId && (
                    <button
                      type="button"
                      onClick={() => setCustomIdEnabled((v) => !v)}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      {customIdEnabled ? "Tự sinh từ tên" : "Sửa mã ID"}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={id}
                  disabled={Boolean(editingOriginalId) || !customIdEnabled}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="Tu_dong_sinh_tu_ten"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600">
                  Mô tả mục đích sử dụng
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="VD: Dùng chấm bài thuyết trình dự án Unit 4"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">
                  Ghi chú thang điểm (tùy chọn)
                </label>
                <input
                  type="text"
                  value={scaleNote}
                  onChange={(e) => setScaleNote(e.target.value)}
                  placeholder="VD: Quy về thang 10, làm tròn 0.5"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Scoring Mode & Scale Configuration */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Cách tính điểm tổng &amp; Làm tròn
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                  Điểm tối đa: {formatScoreNum(draftMaxTotal)}
                  {scoringMode === "weighted_avg"
                    ? ` · Tổng trọng số nhập: ${formatScoreNum(totalWeight)}`
                    : ""}
                </span>
              </div>

              <div className="mt-2.5 grid gap-3 sm:grid-cols-12">
                <div
                  className={
                    scoringMode === "weighted_avg"
                      ? "sm:col-span-5"
                      : "sm:col-span-7"
                  }
                >
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Phương thức tính tổng
                  </label>
                  <SelectField
                    value={scoringMode}
                    onChange={(v) =>
                      setScoringMode(v === "weighted_avg" ? "weighted_avg" : "sum")
                    }
                    options={SCORING_MODE_OPTIONS}
                    size="sm"
                    className="mt-1 w-full"
                  />
                </div>

                {scoringMode === "weighted_avg" && (
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Thang điểm đích
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={targetScale}
                      onChange={(e) =>
                        setTargetScale(parseNumberOr(e.target.value, 10))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                    />
                  </div>
                )}

                <div
                  className={
                    scoringMode === "weighted_avg"
                      ? "sm:col-span-4"
                      : "sm:col-span-5"
                  }
                >
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Bước làm tròn điểm tổng
                  </label>
                  <SelectField
                    value={roundingStep}
                    onChange={setRoundingStep}
                    options={ROUNDING_OPTIONS}
                    size="sm"
                    className="mt-1 w-full"
                  />
                </div>
              </div>
            </div>

            {/* Criteria List */}
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Các tiêu chí ({criteria.length})
                </label>
                <button
                  type="button"
                  onClick={() => setCriteria((c) => [...c, emptyCriterion()])}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm tiêu chí
                </button>
              </div>

              <div className="mt-2 space-y-2.5">
                {criteria.map((c, idx) => {
                  const pct = Math.round((getCriterionWeight(c) / totalWeight) * 100);
                  const levelsCount = (c.levels ?? []).length;
                  const isExpanded = Boolean(expandedLevels[idx]);

                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5"
                    >
                      <div className="grid grid-cols-12 items-center gap-2">
                        <div className="col-span-12 flex items-center gap-1.5 sm:col-span-4">
                          <div className="flex shrink-0 flex-col">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveRow(idx, -1)}
                              className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-25"
                              title="Đưa lên"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === criteria.length - 1}
                              onClick={() => moveRow(idx, 1)}
                              className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-25"
                              title="Đưa xuống"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => updateRow(idx, { name: e.target.value })}
                            placeholder="Tên tiêu chí"
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                          />
                        </div>

                        <input
                          type="text"
                          value={c.description}
                          onChange={(e) =>
                            updateRow(idx, { description: e.target.value })
                          }
                          placeholder="Mô tả yêu cầu của tiêu chí..."
                          className="col-span-12 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-4"
                        />

                        <div className="col-span-4 sm:col-span-1">
                          <input
                            type="number"
                            step="0.5"
                            value={c.min_score}
                            onChange={(e) =>
                              updateRow(idx, {
                                min_score: parseNumberOr(e.target.value, 0),
                              })
                            }
                            title="Điểm tối thiểu"
                            placeholder="Min"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          />
                        </div>

                        <div className="col-span-4 sm:col-span-1">
                          <input
                            type="number"
                            step="0.5"
                            value={c.max_score}
                            onChange={(e) =>
                              updateRow(idx, {
                                max_score: parseNumberOr(e.target.value, 10),
                              })
                            }
                            title="Điểm tối đa"
                            placeholder="Max"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          />
                        </div>

                        <div className="col-span-3 flex items-center gap-1 sm:col-span-1">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={getCriterionWeight(c)}
                            onChange={(e) =>
                              updateRow(idx, {
                                weight: Math.max(
                                  0.1,
                                  parseNumberOr(e.target.value, 1)
                                ),
                              })
                            }
                            title="Trọng số (dùng khi tính trung bình có trọng số)"
                            className="w-full rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-xs"
                          />
                        </div>

                        <div className="col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setCriteria((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            disabled={criteria.length <= 1}
                            className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-30"
                            title="Xóa tiêu chí"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Criterion sub-bar: Weight % badge & Level Descriptors toggle */}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2 pl-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLevels((prev) => ({
                                ...prev,
                                [idx]: !prev[idx],
                              }))
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            <Layers className="h-3 w-3 text-indigo-600" />
                            Mô tả mức đạt ({levelsCount})
                          </button>

                          {levelsCount === 0 && (
                            <button
                              type="button"
                              onClick={() => applyLevelTemplate(idx)}
                              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/70 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                            >
                              <Sparkles className="h-3 w-3" />
                              + Tạo nhanh 3 mức (Tốt / Đạt / Cần cố gắng)
                            </button>
                          )}
                        </div>

                        {scoringMode === "weighted_avg" && (
                          <span className="text-[11px] font-medium text-slate-500">
                            Tỉ trọng quy đổi:{" "}
                            <strong className="text-indigo-700">{pct}%</strong>
                          </span>
                        )}
                      </div>

                      {/* Expanded Level Descriptors */}
                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5 ml-6">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-600">
                              Mô tả chi tiết từng mức điểm (giúp AI chấm sát tiêu chuẩn lớp)
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => applyLevelTemplate(idx)}
                                className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Mẫu 3 mức
                              </button>
                              <button
                                type="button"
                                onClick={() => addLevel(idx)}
                                className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                              >
                                <Plus className="h-3 w-3" />
                                Thêm mức
                              </button>
                            </div>
                          </div>

                          {(c.levels ?? []).length === 0 ? (
                            <p className="py-2 text-center text-[11px] text-slate-400">
                              Chưa có mô tả mức nào. Bấm "Mẫu 3 mức" hoặc "Thêm mức".
                            </p>
                          ) : (
                            (c.levels ?? []).map((lv, lIdx) => (
                              <div
                                key={lIdx}
                                className="grid grid-cols-12 items-center gap-1.5"
                              >
                                <input
                                  type="text"
                                  value={lv.label}
                                  onChange={(e) =>
                                    updateLevel(idx, lIdx, { label: e.target.value })
                                  }
                                  placeholder="Nhãn (VD: Tốt)"
                                  className="col-span-4 rounded border border-slate-200 px-2 py-1 text-xs font-medium sm:col-span-3"
                                />
                                <input
                                  type="text"
                                  value={lv.score_range}
                                  onChange={(e) =>
                                    updateLevel(idx, lIdx, {
                                      score_range: e.target.value,
                                    })
                                  }
                                  placeholder="Khoảng (8.5–10)"
                                  className="col-span-4 rounded border border-slate-200 px-2 py-1 font-mono text-xs sm:col-span-2"
                                />
                                <input
                                  type="text"
                                  value={lv.description}
                                  onChange={(e) =>
                                    updateLevel(idx, lIdx, {
                                      description: e.target.value,
                                    })
                                  }
                                  placeholder="Mô tả biểu hiện để đạt mức này..."
                                  className="col-span-10 rounded border border-slate-200 px-2 py-1 text-xs sm:col-span-6"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeLevel(idx, lIdx)}
                                  className="col-span-2 flex justify-center rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:col-span-1"
                                  title="Xóa mức"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {err && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                ⚠️ {err}
              </div>
            )}
            {msg && (
              <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {msg}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Tạo mới từ đầu
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving
                  ? "Đang lưu..."
                  : editingOriginalId
                  ? "Cập nhật Rubric"
                  : "Lưu Rubric mới"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
