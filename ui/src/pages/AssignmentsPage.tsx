import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookmarkCheck,
  Copy,
  Edit,
  ImagePlus,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SelectField } from "../components/SelectField";
import { api, LANG_LABELS, TASK_LABELS } from "../lib/api";
import {
  FLEX_ROUNDING_OPTIONS,
  FLEX_SCALE_PRESETS,
  readClipboardImageFile,
} from "../lib/gradingConstants";
import { formatScoreNum, slugifyRubricId } from "../lib/rubricUtils";
import type {
  GradingAssignment,
  PromptProfile,
  Rubric,
} from "../lib/types";

interface AssignmentsPageProps {
  assignments: GradingAssignment[];
  rubrics: Rubric[];
  promptProfiles: PromptProfile[];
  activePromptProfileId: string;
  onAssignmentsChanged: (next: GradingAssignment[]) => void;
  onUseAssignment: (assignment: GradingAssignment) => void;
}

const emptyDraft = (defaultProfileId: string): GradingAssignment => ({
  id: "",
  name: "",
  mode: "flexible",
  rubric_id: null,
  max_score: 10,
  rounding_step: 0.5,
  requirements: "",
  task_type: "monologue",
  feedback_lang: "vi",
  prompt_profile_id: defaultProfileId || null,
  images: [],
});

export function AssignmentsPage({
  assignments,
  rubrics,
  promptProfiles,
  activePromptProfileId,
  onAssignmentsChanged,
  onUseAssignment,
}: AssignmentsPageProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(
    assignments[0]?.id ?? ""
  );
  const [editing, setEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<GradingAssignment>(() =>
    emptyDraft(activePromptProfileId)
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirmDeleteTarget, setConfirmDeleteTarget] =
    useState<GradingAssignment | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.requirements.toLowerCase().includes(q)
    );
  }, [assignments, search]);

  const selected = useMemo(
    () => assignments.find((a) => a.id === selectedId) ?? filtered[0] ?? null,
    [assignments, filtered, selectedId]
  );

  // Allow Ctrl+V clipboard image paste while editing
  useEffect(() => {
    if (!editing) return;
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      setErr("");
      void Promise.all(imageFiles.map((f) => readClipboardImageFile(f)))
        .then((loaded) => {
          setDraft((prev) => ({
            ...prev,
            images: [...prev.images, ...loaded],
          }));
          setMsg(`✅ Đã dán ${loaded.length} ảnh đề bài từ clipboard.`);
        })
        .catch((e) => setErr(String(e)));
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [editing]);

  function startCreate() {
    setErr("");
    setMsg("");
    setDraft(emptyDraft(activePromptProfileId));
    setIsNew(true);
    setEditing(true);
  }

  function startEdit(a: GradingAssignment) {
    setErr("");
    setMsg("");
    setDraft({
      ...a,
      images: [...a.images],
    });
    setIsNew(false);
    setEditing(true);
  }

  function startDuplicate(a: GradingAssignment) {
    setErr("");
    setMsg("");
    setDraft({
      ...a,
      id: "",
      name: `${a.name} (Bản sao)`,
      images: [...a.images],
    });
    setIsNew(true);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setIsNew(false);
    setErr("");
  }

  async function handlePickImages() {
    setErr("");
    try {
      const paths = await api.pickImageFiles();
      if (paths.length === 0) return;
      const loaded = await Promise.all(paths.map((p) => api.loadImageFile(p)));
      setDraft((prev) => ({
        ...prev,
        images: [...prev.images, ...loaded],
      }));
    } catch (e) {
      setErr(String(e));
    }
  }

  async function handleSave() {
    const cleanName = draft.name.trim();
    if (!cleanName) {
      setErr("Vui lòng nhập tên đề chấm lẻ.");
      return;
    }
    if (
      draft.mode === "flexible" &&
      !draft.requirements.trim() &&
      draft.images.length === 0
    ) {
      setErr(
        "Chế độ chấm linh hoạt cần nhập yêu cầu chấm hoặc đính kèm ít nhất 1 ảnh đề."
      );
      return;
    }
    setErr("");
    setMsg("");
    setSaving(true);
    try {
      const targetId =
        !isNew && draft.id
          ? draft.id
          : `${slugifyRubricId(cleanName)}_${Date.now().toString().slice(-4)}`;
      const payload: GradingAssignment = {
        ...draft,
        id: targetId,
        name: cleanName,
        max_score:
          Number.isFinite(draft.max_score) && draft.max_score > 0
            ? draft.max_score
            : 10,
        rubric_id:
          draft.mode === "rubric"
            ? draft.rubric_id || rubrics[0]?.id || null
            : null,
      };
      const updated = await api.saveGradingAssignment(payload);
      onAssignmentsChanged(updated);
      setSelectedId(targetId);
      setEditing(false);
      setIsNew(false);
      setMsg(`✅ Đã lưu đề "${cleanName}".`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function executeDelete() {
    if (!confirmDeleteTarget) return;
    const target = confirmDeleteTarget;
    setConfirmDeleteTarget(null);
    setErr("");
    setMsg("");
    try {
      const updated = await api.deleteGradingAssignment(target.id);
      onAssignmentsChanged(updated);
      if (selectedId === target.id) {
        setSelectedId(updated[0]?.id ?? "");
      }
      setEditing(false);
      setMsg(`🗑️ Đã xóa đề "${target.name}".`);
    } catch (e) {
      setErr(String(e));
    }
  }

  const promptProfileName = (id?: string | null) =>
    promptProfiles.find((p) => p.id === (id || activePromptProfileId))
      ?.name ?? "Mặc định";

  return (
    <div className="space-y-4">
      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-800">
          ⚠️ {err}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Master List */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs lg:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <BookmarkCheck className="h-4 w-4 text-indigo-600" />
                Đề chấm lẻ ({assignments.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Quản lý bộ đề linh hoạt &amp; đợt chấm đã lưu.
              </p>
            </div>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo đề mới
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên đề hoặc yêu cầu..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pr-3 pl-8 text-xs focus:border-indigo-400 focus:outline-none"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-xs font-semibold text-slate-600">
                {assignments.length === 0
                  ? "Chưa có đề chấm lẻ nào được lưu."
                  : "Không tìm thấy đề phù hợp."}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Bấm &ldquo;Tạo đề mới&rdquo; hoặc lưu nhanh từ trang Chấm điểm.
              </p>
            </div>
          ) : (
            <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-0.5">
              {filtered.map((a) => {
                const isSelected = !editing && selected?.id === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(a.id);
                      setEditing(false);
                      setErr("");
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-300"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-1 text-sm font-bold text-slate-900">
                        {a.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        {a.mode === "flexible"
                          ? `${formatScoreNum(a.max_score)}đ`
                          : "Rubric"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span>{TASK_LABELS[a.task_type] ?? a.task_type}</span>
                      <span>·</span>
                      <span>{LANG_LABELS[a.feedback_lang] ?? a.feedback_lang}</span>
                      {a.images.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-medium text-indigo-600">
                            {a.images.length} ảnh đề
                          </span>
                        </>
                      )}
                    </div>
                    {a.requirements && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">
                        {a.requirements}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detail / Editor */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
          {editing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Hủy &amp; Quay lại
                  </button>
                  <h3 className="text-base font-bold text-slate-900">
                    {isNew ? "Tạo đề chấm lẻ mới" : `Chỉnh sửa: ${draft.name}`}
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving
                    ? "Đang lưu..."
                    : isNew
                      ? "Tạo đề mới"
                      : "Lưu thay đổi"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Tên đề / Tiêu đề lưu lịch sử
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="VD: Lớp 8A - Speaking Unit 5 (Miêu tả lễ hội)"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Chế độ chấm
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((p) => ({ ...p, mode: "flexible" }))
                      }
                      className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                        draft.mode === "flexible"
                          ? "bg-white text-indigo-700 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Linh hoạt theo Đề
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          mode: "rubric",
                          rubric_id: p.rubric_id || rubrics[0]?.id || null,
                        }))
                      }
                      className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                        draft.mode === "rubric"
                          ? "bg-white text-indigo-700 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Theo Rubric
                    </button>
                  </div>
                </div>

                {draft.mode === "rubric" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Rubric áp dụng
                    </label>
                    <SelectField
                      value={draft.rubric_id ?? ""}
                      onChange={(v) =>
                        setDraft((p) => ({ ...p, rubric_id: v || null }))
                      }
                      options={rubrics.map((r) => ({
                        value: r.id,
                        label: r.name,
                      }))}
                      size="sm"
                      className="mt-1 w-full"
                      ariaLabel="Chọn rubric cho đề"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Thang điểm tối đa
                      </label>
                      <div className="mt-1 flex items-center gap-1">
                        {FLEX_SCALE_PRESETS.map((sc) => (
                          <button
                            key={sc}
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({ ...p, max_score: sc }))
                            }
                            className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                              Math.abs(draft.max_score - sc) < 1e-6
                                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {sc}
                          </button>
                        ))}
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={draft.max_score}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val) && val > 0) {
                              setDraft((p) => ({ ...p, max_score: val }));
                            }
                          }}
                          className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Làm tròn điểm
                      </label>
                      <SelectField
                        value={
                          draft.rounding_step != null
                            ? String(draft.rounding_step)
                            : ""
                        }
                        onChange={(v) =>
                          setDraft((p) => ({
                            ...p,
                            rounding_step: v ? Number(v) : null,
                          }))
                        }
                        options={FLEX_ROUNDING_OPTIONS}
                        size="sm"
                        className="mt-1 w-full"
                        ariaLabel="Bước làm tròn"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Loại bài nói
                  </label>
                  <SelectField
                    value={draft.task_type}
                    onChange={(v) => setDraft((p) => ({ ...p, task_type: v }))}
                    options={Object.entries(TASK_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    }))}
                    size="sm"
                    className="mt-1 w-full"
                    ariaLabel="Loại bài nói"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Ngôn ngữ nhận xét
                  </label>
                  <SelectField
                    value={draft.feedback_lang}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, feedback_lang: v }))
                    }
                    options={Object.entries(LANG_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    }))}
                    size="sm"
                    className="mt-1 w-full"
                    ariaLabel="Ngôn ngữ nhận xét"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Phong cách Prompt
                  </label>
                  <SelectField
                    value={draft.prompt_profile_id || activePromptProfileId}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, prompt_profile_id: v || null }))
                    }
                    options={promptProfiles.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    size="sm"
                    className="mt-1 w-full"
                    ariaLabel="Phong cách Prompt"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Yêu cầu chấm &amp; Nội dung đề bài
                  </label>
                  <textarea
                    rows={5}
                    value={draft.requirements}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, requirements: e.target.value }))
                    }
                    placeholder="Nhập đề bài, tiêu chí chia điểm, từ vựng mục tiêu hoặc lưu ý riêng cho AI..."
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      Ảnh đề bài đính kèm ({draft.images.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => void handlePickImages()}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <ImagePlus className="h-3.5 w-3.5 text-indigo-600" />
                      Thêm ảnh đề (hoặc Ctrl+V)
                    </button>
                  </div>
                  {draft.images.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {draft.images.map((img, idx) => (
                        <div
                          key={`${img.name}-${idx}`}
                          className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                        >
                          <img
                            src={`data:${img.mime_type};base64,${img.data_base64}`}
                            alt={img.name}
                            className="h-24 w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                images: p.images.filter((_, i) => i !== idx),
                              }))
                            }
                            className="absolute top-1 right-1 rounded-full bg-slate-900/75 p-1 text-white hover:bg-rose-600"
                            title="Xóa ảnh này"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      {selected.name}
                    </h3>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                      {selected.mode === "flexible"
                        ? `Linh hoạt · Thang ${formatScoreNum(selected.max_score)}đ`
                        : "Theo Rubric"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {TASK_LABELS[selected.task_type] ?? selected.task_type} ·{" "}
                    {LANG_LABELS[selected.feedback_lang] ??
                      selected.feedback_lang}{" "}
                    · Prompt: {promptProfileName(selected.prompt_profile_id)}
                    {selected.rounding_step != null
                      ? ` · Làm tròn ${selected.rounding_step}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUseAssignment(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Dùng đề này để chấm
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(selected)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => startDuplicate(selected)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Nhân bản
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTarget(selected)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                  Yêu cầu chấm &amp; Nội dung đề bài
                </h4>
                {selected.requirements.trim() ? (
                  <div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm whitespace-pre-wrap text-slate-700">
                    {selected.requirements}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs italic text-slate-400">
                    Không có văn bản yêu cầu (chấm theo ảnh đề đính kèm).
                  </p>
                )}
              </div>

              {selected.images.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                    Ảnh đề bài đính kèm ({selected.images.length})
                  </h4>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {selected.images.map((img, idx) => (
                      <div
                        key={`${img.name}-${idx}`}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={`data:${img.mime_type};base64,${img.data_base64}`}
                          alt={img.name}
                          className="h-36 w-full object-contain bg-white"
                        />
                        <div className="truncate border-t border-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
                          {img.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookmarkCheck className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                Chọn một đề bên trái hoặc tạo đề chấm lẻ mới
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Các đề đã lưu giúp bạn tái sử dụng nhanh yêu cầu chấm, thang điểm
                và ảnh đề cho nhiều học sinh mà không cần nhập lại.
              </p>
              <button
                type="button"
                onClick={startCreate}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Tạo đề chấm lẻ đầu tiên
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteTarget !== null}
        title="Xóa đề chấm lẻ?"
        description={`Bạn có chắc muốn xóa đề "${confirmDeleteTarget?.name ?? ""}"? Các bài đã chấm trước đó trong Lịch sử vẫn được giữ nguyên.`}
        confirmLabel="Xóa đề"
        onConfirm={() => void executeDelete()}
        onCancel={() => setConfirmDeleteTarget(null)}
      />
    </div>
  );
}
