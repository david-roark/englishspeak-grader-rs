import type { Criterion, CriterionLevel, Rubric } from "./types";

export function formatScoreNum(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return Number(v.toFixed(2)).toString();
}

export function slugifyRubricId(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ascii || "rubric_tuy_chinh";
}

export function getCriterionWeight(c: Criterion): number {
  return typeof c.weight === "number" && Number.isFinite(c.weight) && c.weight > 0
    ? c.weight
    : 1;
}

export function getTotalWeight(criteria: Criterion[]): number {
  const sum = criteria.reduce((acc, c) => acc + getCriterionWeight(c), 0);
  return sum > 0 ? sum : Math.max(1, criteria.length);
}

export function computeRubricMaxTotal(
  rubric: Pick<Rubric, "scoring_mode" | "target_scale" | "rounding_step" | "criteria">
): number {
  if (rubric.scoring_mode === "weighted_avg") {
    if (
      typeof rubric.target_scale === "number" &&
      Number.isFinite(rubric.target_scale) &&
      rubric.target_scale > 0
    ) {
      return rubric.target_scale;
    }
    if (rubric.criteria.length === 0) return 0;
    const totalW = getTotalWeight(rubric.criteria);
    const weighted = rubric.criteria.reduce(
      (sum, c) => sum + c.max_score * getCriterionWeight(c),
      0
    );
    return Number((weighted / totalW).toFixed(2));
  }
  return Number(
    rubric.criteria.reduce((sum, c) => sum + (c.max_score || 0), 0).toFixed(2)
  );
}

export function formatRubricScoringSummary(rubric: Rubric): string {
  const max = formatScoreNum(computeRubricMaxTotal(rubric));
  const roundStr =
    typeof rubric.rounding_step === "number" && rubric.rounding_step > 0
      ? ` · làm tròn ${formatScoreNum(rubric.rounding_step)}`
      : "";
  if (rubric.scoring_mode === "weighted_avg") {
    return `TB trọng số → thang ${max}${roundStr}`;
  }
  return `Cộng tổng → ${max}đ${roundStr}`;
}

export function buildThreeLevelTemplate(
  minScore: number,
  maxScore: number
): CriterionLevel[] {
  const min = Number.isFinite(minScore) ? minScore : 0;
  const max = Number.isFinite(maxScore) && maxScore > min ? maxScore : 10;
  const midHigh = min + (max - min) * 0.8;
  const midLow = min + (max - min) * 0.5;
  const fmt = formatScoreNum;
  return [
    {
      label: "Tốt",
      score_range: `${fmt(Number(midHigh.toFixed(1)))}–${fmt(max)}`,
      description: "Đáp ứng xuất sắc yêu cầu tiêu chí, tự nhiên và ít lỗi.",
    },
    {
      label: "Đạt",
      score_range: `${fmt(Number(midLow.toFixed(1)))}–${fmt(Number((midHigh - 0.1).toFixed(1)))}`,
      description: "Đạt mức cơ bản, diễn đạt hiểu được, còn vài lỗi nhỏ.",
    },
    {
      label: "Cần cố gắng",
      score_range: `${fmt(min)}–${fmt(Number((midLow - 0.1).toFixed(1)))}`,
      description: "Còn nhiều ngập ngừng/lỗi ảnh hưởng đến mức độ truyền đạt.",
    },
  ];
}
