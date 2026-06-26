// 클라이언트 스트림 소비 (ARCH §4-B). fetch → reader 루프 → TextDecoder 누적.
// 델타마다 onDelta(누적 전체). abort 시 부분결과 보존. 429 → RateLimitError.
import type { ContextItem, Message, QualityMode } from "@/types";

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export type GeneratePayload = {
  contexts: ContextItem[];
  messages: Message[];
  lang: "ko" | "en";
  mode?: QualityMode; // 생성 품질 모드(미지정 시 서버 기본 fast)
};

export type StreamResult = {
  text: string; // 누적된 전체(부분 포함)
  aborted: boolean;
  error?: string;
};

/**
 * /api/generate 스트림을 소비한다.
 * - onDelta는 매 청크 후 "누적 전체 텍스트"를 받는다(부분 마크다운 렌더 금지 → 누적만 전달).
 * - signal.abort() 시 지금까지의 부분결과를 {aborted:true}로 보존 반환.
 */
export async function generateStream(
  payload: GeneratePayload,
  opts: { signal?: AbortSignal; onDelta: (fullText: string) => void },
): Promise<StreamResult> {
  let acc = "";
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });

    if (res.status === 429) {
      throw new RateLimitError(Number(res.headers.get("Retry-After") ?? "5"));
    }
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `요청 실패 (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      opts.onDelta(acc);
    }
    acc += decoder.decode(); // flush
    opts.onDelta(acc);
    return { text: acc, aborted: false };
  } catch (err) {
    if (opts.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      return { text: acc, aborted: true }; // 부분결과 보존
    }
    if (err instanceof RateLimitError) throw err;
    return { text: acc, aborted: false, error: err instanceof Error ? err.message : String(err) };
  }
}
