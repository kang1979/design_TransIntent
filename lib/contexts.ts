// 세션(원본 프롬프트 + 답변된 질문)을 생성 입력 맥락으로 변환(순수 함수).
// mockMetaPrompt의 category.includes(...) 매칭에 맞춰 카테고리를 추정한다.
import type { ContextItem, Preset, Question } from "@/types";

// preset → 사용자 표시 라벨(HomeInput의 PRESETS와 동일 표기).
const PRESET_LABEL: Record<Preset, string> = {
  writing: "글쓰기",
  coding: "코딩",
  image: "이미지 생성",
  research: "분석·리서치",
  planning: "기획",
};

const CATEGORY_RULES: [RegExp, string][] = [
  [/목적|목표/, "목표"],
  [/독자|대상/, "대상"],
  [/톤|스타일|관점|인칭|비주얼/, "톤"],
  [/출력|형식/, "출력형식"],
  [/분량/, "분량"],
  [/제약|포함|피해|근거|출처/, "제약"],
];

/** 질문 텍스트로 카테고리 추정(맥락 변환 + 질문 화면 라벨 공용). */
export function categoryOf(text: string): string {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(text)) return cat;
  return "기타";
}

const shorten = (s: string, n = 24) => (s.length > n ? s.slice(0, n) + "…" : s);

/** 원본 프롬프트 + 답변된 질문 → 맥락 아이템(skip/빈 답변 제외). preset이 있으면 도메인 맥락을 추가. */
export function sessionToContexts(originalPrompt: string, questions: Question[], preset?: Preset): ContextItem[] {
  const items: ContextItem[] = [];
  const prompt = originalPrompt.trim();
  if (prompt) {
    items.push({
      id: "ctx-request",
      category: "목표",
      label: "요청",
      value: prompt,
      source: "manual",
      enabled: true,
    });
  }
  if (preset) {
    items.push({
      id: "ctx-preset",
      category: "도메인",
      label: "용도",
      value: PRESET_LABEL[preset],
      source: "question",
      enabled: true,
    });
  }
  for (const q of questions) {
    if (q.skipped || q.answer === undefined) continue;
    const value = Array.isArray(q.answer) ? q.answer.join(", ") : String(q.answer).trim();
    if (!value) continue;
    items.push({
      id: `ctx-${q.id}`,
      category: categoryOf(q.text),
      label: shorten(q.text),
      value,
      source: "question",
      enabled: true,
    });
  }
  return items;
}

/** 답변 변경 시: 기존 맥락에 질문 유래 맥락을 증분 머지(질문 답할 때마다 맥락 바 갱신).
 *  - request/preset(ctx-request·ctx-preset): 사용자 인라인 편집 가능 → 기존 항목 보존.
 *  - 질문 유래(ctx-<qid>): 값은 현재 답변으로 재산출, enabled 토글만 보존.
 *  - fresh에 없는 manual/chat 맥락: 뒤에 그대로 유지.
 *  순서는 항상 [요청, 도메인, ...질문(배열 순서), ...manual/chat] — 답변 순서와 무관하게 안정. */
export function syncQuestionContexts(
  originalPrompt: string,
  questions: Question[],
  preset: Preset | undefined,
  prev: ContextItem[],
): ContextItem[] {
  const SPECIAL = new Set(["ctx-request", "ctx-preset"]);
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const fresh = sessionToContexts(originalPrompt, questions, preset);
  const freshIds = new Set(fresh.map((c) => c.id));
  const merged = fresh.map((f) => {
    const old = prevById.get(f.id);
    if (!old) return f;
    return SPECIAL.has(f.id) ? old : { ...f, enabled: old.enabled };
  });
  // manual/chat만 보존. 질문 유래(스킵·빈 멀티선택으로 fresh에서 빠진 것)와 request/preset은 제외.
  const extras = prev.filter((c) => !freshIds.has(c.id) && c.source !== "question" && !SPECIAL.has(c.id));
  return [...merged, ...extras];
}
