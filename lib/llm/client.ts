// OpenAI SDK 클라이언트(서버 전용) + 모델 상수.
// 불변규칙 §1(키 은닉): OPENAI_API_KEY는 env에서만, 브라우저 직접 호출 금지.
// 지연 생성: 모듈 import 시점에 new OpenAI()을 실행하지 않는다.
//   (키 없는 목 분기에서도 이 모듈이 정적 import되므로, 생성자 호출이 import 시점이면
//    키가 없을 때 throw해 목 경로까지 깨진다. 실제 분기에서 호출될 때만 생성.)
import OpenAI from "openai";

let _client: OpenAI | null = null;

/** 실제 OpenAI 호출 직전에만 호출. 이 시점엔 OPENAI_API_KEY가 존재(분기 보장). */
export function getClient(): OpenAI {
  if (!_client) _client = new OpenAI(); // apiKey: process.env.OPENAI_API_KEY (SDK 기본 해석)
  return _client;
}

// 모델 ID는 비추론 모델(즉시 스트리밍·낮은 TTFB). 생성=gpt-4.1 / 질문=gpt-4.1-mini.
export const MODEL_GENERATE = process.env.MODEL_GENERATE ?? "gpt-4.1";
export const MODEL_QUESTIONS = process.env.MODEL_QUESTIONS ?? "gpt-4.1-mini";

/**
 * 생성 "입력" 토큰 상한(로컬 견적 기준, 초과 시 400). 출력은 미포함.
 * ChatComposer의 누적 토큰 상한(6000)과 같은 값으로 맞춰 사용자 체감과 정렬.
 */
export const GEN_TOKEN_LIMIT = 6000;
