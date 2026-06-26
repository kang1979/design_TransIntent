// streamClient.test.ts — generateStream 계약 검증 (V9)
// (a) onDelta가 누적 전체를 순차 전달
// (b) 최종 text가 청크 concat과 일치
// (c) 200 아닌 응답/429 → 에러/RateLimitError
// (d) AbortController.abort() → {aborted:true} 부분결과 보존
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateStream, RateLimitError } from "@/lib/streamClient";

// jsdom 환경에서 ReadableStream과 TextEncoder는 node 글로벌로 존재.

/** 문자열 배열을 ReadableStream으로 변환하는 헬퍼 */
function chunksToStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** fetch를 모킹해 지정한 스트림과 status를 반환 */
function mockFetch(stream: ReadableStream<Uint8Array>, status = 200, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      body: stream,
      headers: {
        get: (key: string) => headers[key.toLowerCase()] ?? null,
      },
      text: async () => `Error ${status}`,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const basePayload = {
  contexts: [],
  messages: [],
  lang: "ko" as const,
};

describe("generateStream — 정상 스트림", () => {
  it("(a) onDelta가 누적 전체를 순차 전달한다", async () => {
    const chunks = ["# 역할", "\n본문"];
    mockFetch(chunksToStream(chunks));

    const deltas: string[] = [];
    await generateStream(basePayload, {
      onDelta: (full) => deltas.push(full),
    });

    // 첫 번째 delta: "# 역할", 두 번째: "# 역할\n본문", 세 번째: flush 후 동일
    expect(deltas[0]).toBe("# 역할");
    expect(deltas[1]).toBe("# 역할\n본문");
    // 모든 delta가 접두사 관계 — 이전 delta는 다음 delta의 접두사
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toContain(deltas[i - 1]);
    }
  });

  it("(b) 최종 text가 청크 concat과 일치한다", async () => {
    const chunks = ["Hello", " ", "World"];
    mockFetch(chunksToStream(chunks));

    const result = await generateStream(basePayload, { onDelta: () => {} });
    expect(result.text).toBe("Hello World");
    expect(result.aborted).toBe(false);
    expect(result.error).toBeUndefined();
  });
});

describe("generateStream — 에러 응답", () => {
  it("(c) 200 아닌 응답(500) → error 필드로 반환", async () => {
    mockFetch(chunksToStream([]), 500);

    const result = await generateStream(basePayload, { onDelta: () => {} });
    expect(result.error).toBeTruthy();
    expect(result.aborted).toBe(false);
  });

  it("(c) 429 → RateLimitError throw", async () => {
    mockFetch(chunksToStream([]), 429, { "retry-after": "10" });

    await expect(
      generateStream(basePayload, { onDelta: () => {} }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("(c) 429 RateLimitError.retryAfter에 Retry-After 헤더값이 반영된다", async () => {
    mockFetch(chunksToStream([]), 429, { "retry-after": "30" });

    const err = await generateStream(basePayload, { onDelta: () => {} }).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfter).toBe(30);
  });
});

describe("generateStream — 취소(abort)", () => {
  it("(d) AbortController.abort() 시 {aborted:true} + 부분결과 보존", async () => {
    const ctrl = new AbortController();

    // 청크를 천천히 흘려보내는 스트림 — pull 기반으로 AbortController 취소 시뮬레이션
    const encoder = new TextEncoder();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        // fetch 자체가 abort signal을 받지만 여기서는 스트림을 반환한 뒤 시뮬레이션
        const signal = opts.signal as AbortSignal;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => {
              let callCount = 0;
              return {
                read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
                  callCount++;
                  if (callCount === 1) {
                    // 첫 청크 반환 후 abort 트리거
                    return { done: false, value: encoder.encode("부분결과") };
                  }
                  if (callCount === 2) {
                    // 두 번째 호출 — abort 확인
                    if (signal?.aborted) {
                      throw new DOMException("AbortError", "AbortError");
                    }
                    return { done: false, value: encoder.encode("_이건_안옴") };
                  }
                  return { done: true };
                },
                cancel: () => Promise.resolve(),
              };
            },
          },
          headers: { get: () => null },
        };
      }),
    );

    // 첫 청크 수신 후 abort
    let onDeltaCount = 0;
    const promise = generateStream(basePayload, {
      signal: ctrl.signal,
      onDelta: (full) => {
        onDeltaCount++;
        if (onDeltaCount === 1) {
          // 첫 delta 수신 즉시 abort
          ctrl.abort();
        }
        return full;
      },
    });

    const result = await promise;
    expect(result.aborted).toBe(true);
    // 첫 청크는 받았으므로 부분결과 포함
    expect(result.text).toBe("부분결과");
    expect(result.error).toBeUndefined();
  });
});
