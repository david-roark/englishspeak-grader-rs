import { describe, expect, it } from "vitest";
import {
  buildThreeLevelTemplate,
  computeRubricMaxTotal,
  formatRubricScoringSummary,
  formatScoreNum,
  getCriterionWeight,
  getTotalWeight,
  slugifyRubricId,
} from "./rubricUtils";
import type { Rubric } from "./types";

describe("rubricUtils", () => {
  it("formats scores cleanly without trailing float noise", () => {
    expect(formatScoreNum(7.0)).toBe("7");
    expect(formatScoreNum(7.25)).toBe("7.25");
    expect(formatScoreNum(Number.NaN)).toBe("0");
  });

  it("slugifies Vietnamese rubric names into clean snake_case IDs", () => {
    expect(slugifyRubricId("Thuyết trình Tiếng Anh lớp 10!")).toBe(
      "thuyet_trinh_tieng_anh_lop_10"
    );
    expect(slugifyRubricId("Đánh giá Phát âm")).toBe("danh_gia_phat_am");
    expect(slugifyRubricId("   ")).toBe("rubric_tuy_chinh");
  });

  it("computes criterion weights, total score, and summary for sum and weighted_avg modes", () => {
    const sumRubric: Rubric = {
      id: "sum_test",
      name: "Sum",
      description: "",
      scale_note: "",
      is_builtin: false,
      scoring_mode: "sum",
      criteria: [
        { name: "A", description: "", min_score: 0, max_score: 4 },
        { name: "B", description: "", min_score: 0, max_score: 6, weight: 2 },
      ],
    };
    expect(getCriterionWeight(sumRubric.criteria[0])).toBe(1);
    expect(getTotalWeight(sumRubric.criteria)).toBe(3);
    expect(computeRubricMaxTotal(sumRubric)).toBe(10);
    expect(formatRubricScoringSummary(sumRubric)).toBe("Cộng tổng → 10đ");

    const weightedRubric: Rubric = {
      ...sumRubric,
      id: "weighted_test",
      scoring_mode: "weighted_avg",
      target_scale: 9,
      rounding_step: 0.5,
    };
    expect(computeRubricMaxTotal(weightedRubric)).toBe(9);
    expect(formatRubricScoringSummary(weightedRubric)).toBe(
      "TB trọng số → thang 9 · làm tròn 0.5"
    );
  });

  it("builds 3 ordered level descriptors covering min..max range", () => {
    const levels = buildThreeLevelTemplate(0, 10);
    expect(levels).toHaveLength(3);
    expect(levels[0].label).toBe("Tốt");
    expect(levels[0].score_range).toBe("8–10");
    expect(levels[1].label).toBe("Đạt");
    expect(levels[2].label).toBe("Cần cố gắng");
  });
});
