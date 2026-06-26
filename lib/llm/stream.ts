// 중립 스트림 어댑터 — 라우트를 OpenAI 스트림 청크 모양에서 분리한다.
// OpenAI Stream<ChatCompletionChunk>을 감싸 텍스트 델타만 흘리고(원시 SSE 비노출, §3),
// 소비 완료 후 usage/모델/종료사유를 로깅용으로 노출한다.
import type { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

export interface MetaFinal {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number; // OpenAI 자동 프리픽스 캐싱 적중 토큰(prompt_tokens_details.cached_tokens)
  stopReason: string | null; // finish_reason: stop/length/tool_calls
}

export interface MetaStream {
  /** 텍스트 델타만 yield. 끝까지 소비해야 final()이 채워진다. */
  text(): AsyncIterable<string>;
  /** text() 소비 완료 후 호출 — 누적된 usage/모델/종료사유. */
  final(): MetaFinal;
  /** 소비 측 취소 시 상류 호출 중단. */
  abort(): void;
}

/**
 * OpenAI 스트리밍 응답을 MetaStream으로 래핑.
 * stream_options:{include_usage:true}로 마지막 chunk에 usage가 실려 오며,
 * 그 chunk의 choices는 빈 배열이므로 옵셔널 체이닝으로 가드한다.
 */
export function toMetaStream(stream: Stream<ChatCompletionChunk>): MetaStream {
  let model = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let stopReason: string | null = null;

  return {
    async *text() {
      for await (const chunk of stream) {
        if (chunk.model) model = chunk.model;
        const choice = chunk.choices[0];
        if (choice?.finish_reason) stopReason = choice.finish_reason;
        const delta = choice?.delta?.content;
        if (delta) yield delta;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          cacheRead = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        }
      }
    },
    final() {
      return { model, inputTokens, outputTokens, cacheRead, stopReason };
    },
    abort() {
      stream.controller.abort();
    },
  };
}
