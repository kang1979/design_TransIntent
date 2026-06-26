import { describe, it, expect } from "vitest";
import { revealStep } from "@/lib/typewriter";

// 기본값: baseCps=120, maxLagSec=0.5 → 가속 임계 backlog = 60.
describe("revealStep — 시간 기반 타이프라이터 전진", () => {
  it("이미 따라잡았으면 0(전진 없음)", () => {
    expect(revealStep(10, 10, 16)).toBe(0);
    expect(revealStep(12, 10, 16)).toBe(0); // shown이 더 커도 0
  });

  it("등속: 경과 시간 × baseCps(backlog가 임계 이하일 때)", () => {
    expect(revealStep(0, 20, 100)).toBe(12); // 0.1s × 120 = 12 (backlog 20 ≤ 60)
    expect(revealStep(0, 20, 50)).toBe(6); // 0.05s × 120 = 6
  });

  it("경과가 매우 짧으면 0 가능(시간 누적)", () => {
    expect(revealStep(0, 50, 8)).toBe(0); // backlog 50 ≤ 60 → 0.008s × 120 = 0.96 → floor 0
  });

  it("너무 뒤처지면 지연상한(0.5s) 내로 가속", () => {
    expect(revealStep(0, 600, 50)).toBe(60); // backlog 600 > 60 → cps 1200, 0.05s → 60
    expect(revealStep(0, 6000, 10)).toBe(120); // cps 12000, 0.01s → 120
  });

  it("target을 절대 넘지 않음(backlog로 클램프)", () => {
    expect(revealStep(0, 3, 1000)).toBe(3); // 1s면 120자지만 backlog 3으로 클램프
    for (let target = 0; target <= 40; target++) {
      for (let shown = 0; shown <= target; shown++) {
        const n = revealStep(shown, target, 16);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(shown + n).toBeLessThanOrEqual(target);
      }
    }
  });
});
