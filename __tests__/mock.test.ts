import { describe, it, expect } from "vitest";
import { mockQuestions, mockMetaPrompt, mockIntent, mockCritique, chunkText } from "@/lib/llm/mock";
import type { ContextItem } from "@/types";

describe("mock 엔진 (결정적)", () => {
  it("질문 N개(≤5) 생성, 동일 입력은 동일 결과", () => {
    const a = mockQuestions({ prompt: "여행 일정 짜줘" });
    const b = mockQuestions({ prompt: "여행 일정 짜줘" });
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(5);
    expect(a).toEqual(b); // 결정성
    expect(a.every((q) => q.skipped === false)).toBe(true);
  });

  it("exclude로 기존 질문 제외(질문 더 받기)", () => {
    const first = mockQuestions({ prompt: "p" });
    const more = mockQuestions({ prompt: "p", exclude: first.map((q) => q.id) });
    const overlap = more.filter((q) => first.some((f) => f.id === q.id));
    expect(overlap).toHaveLength(0);
  });

  it("preset에 따라 도메인 특화 질문이 상위 5개 안에 노출", () => {
    const coding = mockQuestions({ prompt: "p", preset: "coding" });
    expect(coding.length).toBeLessThanOrEqual(5);
    // BASE에 없는 coding 전용 질문(언어/스택)이 실제로 포함돼야 한다(우선 배치).
    expect(coding.some((q) => q.text.includes("언어/스택"))).toBe(true);
    const writing = mockQuestions({ prompt: "p", preset: "writing" });
    expect(writing.some((q) => q.text.includes("문서 유형"))).toBe(true);
  });

  it("mockMetaPrompt — 구조화 섹션과 맥락 값 포함", () => {
    const ctx: ContextItem[] = [
      { id: "1", category: "목표", label: "목표", value: "제주 여행", source: "question", enabled: true },
      { id: "2", category: "톤", label: "톤", value: "친근", source: "manual", enabled: false },
    ];
    const out = mockMetaPrompt(ctx, [], "ko");
    expect(out).toContain("# 역할");
    expect(out).toContain("# 제약");
    expect(out).toContain("제주 여행"); // enabled 포함
    expect(out).not.toContain("친근"); // disabled 제외
  });

  it("chunkText — 빈 문자열 아닌 청크로 분할", () => {
    const chunks = chunkText("# 역할\n전문 어시스턴트");
    expect(chunks.join("")).toBe("# 역할\n전문 어시스턴트");
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("mockIntent — 결정적 IntentBrief, 맥락에서 목표/대상/성공기준 도출", () => {
    const ctx: ContextItem[] = [
      { id: "ctx-request", category: "목표", label: "요청", value: "제주 여행 일정", source: "manual", enabled: true },
      { id: "ctx-aud", category: "대상", label: "대상", value: "가족", source: "question", enabled: true },
      { id: "ctx-off", category: "톤", label: "톤", value: "친근", source: "manual", enabled: false },
    ];
    const a = mockIntent(ctx, [], "ko");
    const b = mockIntent(ctx, [], "ko");
    expect(a).toEqual(b); // 결정성(Math.random/Date.now 미사용)
    expect(a.goal).toContain("제주 여행 일정");
    expect(a.audience).toContain("가족");
    expect(a.successCriteria.length).toBeGreaterThan(0);
  });

  it("mockMetaPrompt — brief 주입 시 목표·성공기준이 본문에 반영", () => {
    const ctx: ContextItem[] = [
      { id: "1", category: "목표", label: "목표", value: "제주 여행", source: "question", enabled: true },
    ];
    const brief = mockIntent(ctx, [], "ko");
    const out = mockMetaPrompt(ctx, [], "ko", brief);
    expect(out).toContain("# 역할");
    expect(out).toContain(brief.successCriteria[0]); // rubric을 제약 섹션에 반영
  });

  it("mockCritique — 초안에 성공기준 체크리스트를 덧붙인 결정적 정제본", () => {
    const ctx: ContextItem[] = [
      { id: "1", category: "목표", label: "목표", value: "제주 여행", source: "question", enabled: true },
    ];
    const brief = mockIntent(ctx, [], "ko");
    const draft = mockMetaPrompt(ctx, [], "ko", brief);
    const refined = mockCritique(draft, brief, "ko");
    expect(refined.startsWith(draft)).toBe(true); // 초안 보존
    expect(refined).toContain("# 품질 체크리스트");
    expect(mockCritique(draft, brief, "ko")).toBe(refined); // 결정성
  });
});
