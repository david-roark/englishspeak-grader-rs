import { useState } from "react";
import { Copy, Edit, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Criterion, Rubric } from "../lib/types";

interface RubricsPageProps {
  rubrics: Rubric[];
  onRubricsChanged: (next: Rubric[]) => void;
}

const emptyCriterion = (): Criterion => ({
  name: "",
  description: "",
  min_score: 0,
  max_score: 10,
});

export function RubricsPage({ rubrics, onRubricsChanged }: RubricsPageProps) {
  const [selectedId, setSelectedId] = useState<string>(rubrics[0]?.id ?? "");

  // Form state for create/edit
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scaleNote, setScaleNote] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([
    emptyCriterion(),
    emptyCriterion(),
    emptyCriterion(),
  ]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = rubrics.find((r) => r.id === selectedId) ?? rubrics[0];

  function loadForEdit(r: Rubric) {
    setMsg("");
    setErr("");
    setId(r.id);
    setName(r.name);
    setDescription(r.description);
    setScaleNote(r.scale_note);
    setCriteria(r.criteria.map((c) => ({ ...c })));
  }

  function resetForm() {
    setId("");
    setName("");
    setDescription("");
    setScaleNote("");
    setCriteria([emptyCriterion(), emptyCriterion(), emptyCriterion()]);
    setMsg("");
    setErr("");
  }

  async function handleSave() {
    setMsg("");
    setErr("");
    const cleanedCriteria = criteria.filter((c) => c.name.trim() !== "");
    if (!id.trim() || !name.trim()) {
      setErr("Cần nhập cả mã (id) và tên rubric.");
      return;
    }
    if (cleanedCriteria.length === 0) {
      setErr("Cần ít nhất 1 tiêu chí.");
      return;
    }

    setSaving(true);
    try {
      const updated = await api.saveCustomRubric({
        id: id.trim(),
        name: name.trim(),
        description: description.trim(),
        scale_note: scaleNote.trim(),
        is_builtin: false,
        criteria: cleanedCriteria.map((c) => ({
          name: c.name.trim(),
          description: c.description.trim(),
          min_score: Number(c.min_score) || 0,
          max_score: Number(c.max_score) || 10,
        })),
      });
      onRubricsChanged(updated);
      setSelectedId(id.trim());
      setMsg(`✅ Đã lưu rubric '${name.trim()}' (${cleanedCriteria.length} tiêu chí).`);
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
      setMsg(`✅ Đã nhân bản '${r.name}' thành '${suggestedName}'. Bạn có thể chỉnh sửa bên phải.`);
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

  return (
    <div className="grid items-start gap-4 md:grid-cols-12">
      {/* Left: List & preview */}
      <div className="space-y-3 md:col-span-5 xl:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
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

          <div className="mt-2.5 max-h-[36vh] space-y-2 overflow-y-auto pr-1">
            {rubrics.map((r) => {
              const active = selected?.id === r.id;
              const maxTotal = r.criteria.reduce((sum, c) => sum + c.max_score, 0);
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
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
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
                        <code>{r.id}</code> · {r.criteria.length} tiêu chí · Tổng tối đa:{" "}
                        {maxTotal}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleClone(r);
                        }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600"
                        title="Nhân bản để tạo biến thể"
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
            <h3 className="text-sm font-bold text-slate-800">
              Chi tiết: {selected.name}
            </h3>
            {selected.description && (
              <p className="mt-1 text-xs text-slate-600">{selected.description}</p>
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
                  <th className="w-16 py-1.5 text-right">Điểm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selected.criteria.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-2 font-semibold text-slate-800">
                      {c.name}
                    </td>
                    <td className="py-2 pr-2 text-slate-600">{c.description}</td>
                    <td className="py-2 text-right font-medium text-indigo-700">
                      {c.min_score}–{c.max_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: Create / Edit Form */}
      <div className="md:col-span-7 xl:col-span-8">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">
            Tạo / Chỉnh sửa Rubric tùy chỉnh
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Bạn có thể tạo mới hoặc bấm biểu tượng nhân bản ở danh sách bên trái để sửa nhanh từ rubric chuẩn.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Mã (id, không dấu)
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="VD: speaking_lop_10"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Tên hiển thị
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Rubric Speaking Lớp 10"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Mô tả
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Các tiêu chí
              </label>
              <button
                type="button"
                onClick={() => setCriteria((c) => [...c, emptyCriterion()])}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm dòng
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {criteria.map((c, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-center gap-2 rounded-lg bg-slate-50 p-2"
                >
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateRow(idx, { name: e.target.value })}
                    placeholder="Tên tiêu chí"
                    className="col-span-12 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs sm:col-span-3"
                  />
                  <input
                    type="text"
                    value={c.description}
                    onChange={(e) =>
                      updateRow(idx, { description: e.target.value })
                    }
                    placeholder="Mô tả"
                    className="col-span-12 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs sm:col-span-4"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={c.min_score}
                    onChange={(e) =>
                      updateRow(idx, { min_score: Number(e.target.value) })
                    }
                    placeholder="Min"
                    title="Điểm tối thiểu"
                    className="col-span-5 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs sm:col-span-2"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={c.max_score}
                    onChange={(e) =>
                      updateRow(idx, { max_score: Number(e.target.value) })
                    }
                    placeholder="Max"
                    title="Điểm tối đa"
                    className="col-span-5 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs sm:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCriteria((prev) => prev.filter((_, i) => i !== idx))
                    }
                    disabled={criteria.length <= 1}
                    className="col-span-2 flex justify-center rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 sm:col-span-1"
                    title="Xóa dòng"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
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

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Làm mới form
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Đang lưu..." : "Lưu rubric"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
