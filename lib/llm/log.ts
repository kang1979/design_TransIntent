// 구조화 LLM 로깅(진입부 ⑤). 1차 출시 운영 MVP. Sentry는 별도 백로그.
type LLMLog = {
  requestId: string;
  route: "generate" | "questions";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number; // OpenAI 자동 프리픽스 캐싱 적중 토큰(prompt_tokens_details.cached_tokens)
  ttfbMs?: number;
  totalMs?: number;
  count?: number; // questions: 생성 질문 수
  mode?: "fast" | "max"; // generate: 품질 모드
  stopReason?: string | null;
  error?: string;
};

/** 한 줄 JSON으로 구조화 로깅(수집기가 파싱 가능). */
export function logLLM(record: LLMLog): void {
  console.log(JSON.stringify({ kind: "llm", ...record }));
}
