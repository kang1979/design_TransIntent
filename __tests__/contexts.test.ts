import { describe, it, expect } from "vitest";
import { sessionToContexts, syncQuestionContexts } from "@/lib/contexts";
import { mockMetaPrompt, chunkText } from "@/lib/llm/mock";
import type { ContextItem, Question } from "@/types";

const q = (over: Partial<Question> & { id: string; text: string }): Question => ({
  type: "single",
  skipped: false,
  ...over,
});

describe("sessionToContexts → 생성 입력", () => {
  it("원본 프롬프트 + 답변된 질문만 맥락으로 변환", () => {
    const questions: Question[] = [
      q({ id: "q1", text: "이 결과물의 주요 목적은?", answer: "정보 전달" }),
      q({ id: "q2", text: "원하는 톤/스타일은?", type: "multi", answer: ["친근하게", "간결하게"] }),
      q({ id: "q3", text: "분량은?", answer: undefined }), // 미응답 → 제외
      q({ id: "q4", text: "제약 있나요?", type: "short", skipped: true }), // 스킵 → 제외
    ];
    const ctx = sessionToContexts("여행 일정 짜줘", questions);
    expect(ctx[0]).toMatchObject({ id: "ctx-request", category: "목표", value: "여행 일정 짜줘" });
    expect(ctx.find((c) => c.id === "ctx-q1")).toMatchObject({ category: "목표" });
    expect(ctx.find((c) => c.id === "ctx-q2")?.value).toBe("친근하게, 간결하게");
    expect(ctx.some((c) => c.id === "ctx-q3" || c.id === "ctx-q4")).toBe(false);
  });

  it("preset이 주어지면 도메인 맥락(용도)을 추가", () => {
    const ctx = sessionToContexts("코드 짜줘", [], "coding");
    const domain = ctx.find((c) => c.id === "ctx-preset");
    expect(domain).toMatchObject({ category: "도메인", label: "용도", value: "코딩" });
    // preset 없으면 도메인 맥락 없음
    expect(sessionToContexts("코드 짜줘", []).some((c) => c.id === "ctx-preset")).toBe(false);
  });

  it("변환된 맥락이 메타프롬프트에 반영(스트림 청크 합치면 원문 동일)", () => {
    const ctx = sessionToContexts("블로그 글 써줘", [
      q({ id: "q1", text: "톤은?", answer: "친근하게" }),
    ]);
    const meta = mockMetaPrompt(ctx, [], "ko");
    expect(meta).toContain("블로그 글 써줘");
    expect(meta).toContain("친근하게");
    // text/plain 델타 청크 누적 == 원문 (reader 누적 후 1회 렌더 계약)
    expect(chunkText(meta).join("")).toBe(meta);
  });
});

describe("syncQuestionContexts → 답변 증분 머지", () => {
  const manual = (over: Partial<ContextItem> & { id: string }): ContextItem => ({
    category: "기타",
    label: "L",
    value: "V",
    source: "manual",
    enabled: true,
    ...over,
  });

  it("질문 답변을 prev에 머지하고 질문 순서로 안정 정렬(요청·도메인 우선)", () => {
    const questions = [
      q({ id: "q1", text: "목적은?", answer: "정보 전달" }),
      q({ id: "q2", text: "톤은?", answer: "친근하게" }),
    ];
    const next = syncQuestionContexts("여행 짜줘", questions, "writing", []);
    expect(next.map((c) => c.id)).toEqual(["ctx-request", "ctx-preset", "ctx-q1", "ctx-q2"]);
  });

  it("manual/chat 맥락은 fresh에 없어도 뒤에 보존", () => {
    const prev = [manual({ id: "ctx-manual-0", label: "언어", value: "한국어" })];
    const next = syncQuestionContexts("프롬프트", [q({ id: "q1", text: "톤은?", answer: "친근" })], undefined, prev);
    expect(next.map((c) => c.id)).toEqual(["ctx-request", "ctx-q1", "ctx-manual-0"]);
  });

  it("질문 맥락은 값 재산출 + enabled 토글 보존", () => {
    const prev = [manual({ id: "ctx-q1", source: "question", enabled: false, value: "옛값" })];
    const next = syncQuestionContexts("p", [q({ id: "q1", text: "톤은?", answer: "새값" })], undefined, prev);
    const item = next.find((c) => c.id === "ctx-q1");
    expect(item).toMatchObject({ value: "새값", enabled: false });
  });

  it("request/preset은 사용자 편집값 보존(기존 항목 우선)", () => {
    const prev = [manual({ id: "ctx-request", source: "manual", value: "편집된 요청", enabled: false })];
    const next = syncQuestionContexts("원본 요청", [], undefined, prev);
    expect(next.find((c) => c.id === "ctx-request")).toMatchObject({ value: "편집된 요청", enabled: false });
  });

  it("멀티선택을 모두 해제하면 해당 질문 맥락이 사라진다", () => {
    const prev = syncQuestionContexts("p", [q({ id: "q1", text: "톤은?", type: "multi", answer: ["친근"] })], undefined, []);
    expect(prev.some((c) => c.id === "ctx-q1")).toBe(true);
    const after = syncQuestionContexts("p", [q({ id: "q1", text: "톤은?", type: "multi", answer: [] })], undefined, prev);
    expect(after.some((c) => c.id === "ctx-q1")).toBe(false);
  });
});
