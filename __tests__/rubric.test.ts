// evals 하니스 집계 로직 단위테스트 — 네트워크 없이 결정적으로 검증(plan §검증).
import { describe, it, expect } from "vitest";
import { DIMENSIONS, weightedScore, aggregate, type DimScores, type CaseResult } from "../evals/rubric";

function full(v: number): DimScores {
  const s: DimScores = {};
  for (const d of DIMENSIONS) s[d.key] = v;
  return s;
}

describe("rubric 집계 (결정적)", () => {
  it("가중치 합은 1.0", () => {
    const sum = DIMENSIONS.reduce((s, d) => s + d.weight, 0);
    expect(Math.round(sum * 1000) / 1000).toBe(1);
  });

  it("weightedScore — 전 차원 5점 = 100, 1점 = 0, 3점 = 50", () => {
    expect(weightedScore(full(5))).toBe(100);
    expect(weightedScore(full(1))).toBe(0);
    expect(weightedScore(full(3))).toBe(50);
  });

  it("weightedScore — 누락/범위밖 차원은 3(중립)으로 간주", () => {
    expect(weightedScore({})).toBe(50); // 전부 누락 → 모두 3
    expect(weightedScore({ faithfulness: 9 })).toBe(50); // 범위밖 → 3
  });

  it("aggregate — 전체 평균·차원별 평균·약한 차원 정렬", () => {
    const results: CaseResult[] = [
      { caseId: "a", scores: { ...full(5), faithfulness: 2 }, score: weightedScore({ ...full(5), faithfulness: 2 }) },
      { caseId: "b", scores: { ...full(5), faithfulness: 2 }, score: weightedScore({ ...full(5), faithfulness: 2 }) },
    ];
    const agg = aggregate(results);
    expect(agg.n).toBe(2);
    expect(agg.perDimension.faithfulness).toBe(2); // 가장 낮은 차원
    expect(agg.weakest[0]).toBe("faithfulness"); // 약한 차원이 먼저
    expect(agg.overall).toBeGreaterThan(0);
    expect(agg.overall).toBeLessThan(100);
  });

  it("aggregate — 빈 입력은 0/빈 집계", () => {
    const agg = aggregate([]);
    expect(agg.n).toBe(0);
    expect(agg.overall).toBe(0);
    expect(agg.weakest).toEqual([]);
  });
});
