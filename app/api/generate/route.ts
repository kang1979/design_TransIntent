// /api/generate — 메타프롬프트 생성 스트림 (streaming-route-handler 스킬 정본).
// 목 먼저: MOCK_LLM=1 또는 키 없음 → mockMetaPrompt를 text/plain 델타로 스트림.
// 불변식: 원시 SSE 비노출 · user 입력은 user 역할로만(실제 연결 시) · runtime=nodejs.
import { z } from "zod";
import { mockMetaPrompt, mockIntent, mockCritique, chunkText } from "@/lib/llm/mock";
import { analyzeIntent, countGenerateTokens, streamMetaPrompt, critiqueAndStreamRevision } from "@/lib/llm/engine";
import { GEN_TOKEN_LIMIT } from "@/lib/llm/client";
import { logLLM } from "@/lib/llm/log";

export const runtime = "nodejs";
export const maxDuration = 300; // Hobby면 60

const Body = z.object({
  contexts: z
    .array(
      z.object({
        id: z.string(),
        category: z.string(),
        label: z.string(),
        value: z.string().max(2000),
        source: z.enum(["question", "manual", "chat"]),
        enabled: z.boolean(),
      }),
    )
    .min(1) // 빈 입력 차단(진입부 ②)
    .max(40),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .default([]),
  lang: z.enum(["ko", "en"]).default("ko"),
  mode: z.enum(["fast", "max"]).default("fast"), // fast=의도분석→생성 / max=초안→자기검토→최종
});

/** 목 먼저: MOCK_LLM=1 이거나 API 키가 없으면 결정적 목 스트림을 반환. */
function shouldUseMock(): boolean {
  return process.env.MOCK_LLM === "1" || !process.env.OPENAI_API_KEY;
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response("잘못된 요청입니다.", { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return new Response("잘못된 요청입니다.", { status: 400 });
  const { contexts, messages, lang, mode } = parsed.data;

  const requestId = crypto.randomUUID();

  if (shouldUseMock()) {
    // Stage A 의도 분석 → 생성 →(max면) 자기검토. 모두 결정적 목, 동일 코드 경로.
    const brief = mockIntent(contexts, messages, lang);
    const draft = mockMetaPrompt(contexts, messages, lang, brief);
    const text = mode === "max" ? mockCritique(draft, brief, lang) : draft;
    // 결정적 메타프롬프트를 토큰형 청크로 흘려보낸다(원시 SSE 아님, 순수 텍스트 델타).
    const chunks = chunkText(text);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const c of chunks) {
            if (req.signal.aborted) break; // 클라가 끊으면 상류도 중단
            controller.enqueue(encoder.encode(c));
            await new Promise((r) => setTimeout(r, 12)); // 타이핑 체감용(결정적)
          }
          controller.close();
        } catch (err) {
          controller.error(err); // 클라가 부분결과 보존 후 처리
        }
      },
      cancel() {
        // 소비 측 취소 시 추가 정리 불필요(목).
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        "X-Request-Id": requestId,
      },
    });
  }

  // 실제 OpenAI 스트리밍.
  // 진입부: ① 레이트리밋(별도 백로그) → ② Zod(위) → (max만) ⓐ 의도분석 → ③ countTokens 견적 → ④ 호출 → ⑤ 로깅.
  // TTFB: fast는 의도분석을 생성 system에 인라인 흡수해 별도 왕복 없이 곧바로 스트림(첫 토큰 단축).
  //       max는 품질 우선 — 의도 브리프(Stage A) → 초안 → 자기검토 파이프라인 유지.
  // req.signal 전달: 스트림 시작 전 단계에서 클라가 끊으면 상류 호출도 중단(낭비 차단).
  let brief;
  if (mode === "max") {
    try {
      brief = await analyzeIntent(contexts, messages, lang, req.signal);
    } catch (err) {
      if (req.signal.aborted) return new Response(null, { status: 499 }); // 클라가 끊음
      logLLM({ requestId, route: "generate", error: `intent: ${String(err)}` });
      return new Response("의도 분석에 실패했습니다.", { status: 502 });
    }
  }

  let estimate: number;
  try {
    estimate = await countGenerateTokens(contexts, messages, lang, brief, req.signal); // ③ 사전견적(max면 brief 포함)
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    // fail-closed: 견적 실패면 생성도 실패할 가능성이 높아 502로 차단.
    logLLM({ requestId, route: "generate", error: String(err) });
    return new Response("생성 견적에 실패했습니다.", { status: 502 });
  }
  if (estimate > GEN_TOKEN_LIMIT) {
    return new Response("맥락이 너무 깁니다. 일부를 정리해 주세요.", { status: 400 });
  }

  const startedAt = Date.now();
  let firstTokenAt = 0;
  // ④ 클라 취소→상류 중단. max면 초안→자기검토 후 개선본 스트림, fast면 단일 스트림(brief 없음).
  // max는 초안 생성(비스트림)이 스트림 시작 전에 실패할 수 있어 여기서 잡아 502로 정리.
  let meta;
  try {
    meta =
      mode === "max"
        ? await critiqueAndStreamRevision(contexts, messages, lang, brief!, req.signal)
        : await streamMetaPrompt(contexts, messages, lang, undefined, req.signal);
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 }); // 클라가 끊음
    logLLM({ requestId, route: "generate", error: `draft: ${String(err)}` });
    return new Response("생성에 실패했습니다.", { status: 502 });
  }
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 어댑터가 텍스트 델타만 흘린다(원시 SSE 비노출, §3).
        for await (const delta of meta.text()) {
          if (!firstTokenAt) firstTokenAt = Date.now();
          controller.enqueue(encoder.encode(delta));
        }
        const final = meta.final(); // ⑤ 토큰·캐시·종료사유 로깅
        logLLM({
          requestId,
          route: "generate",
          mode,
          model: final.model,
          inputTokens: final.inputTokens,
          outputTokens: final.outputTokens,
          cacheRead: final.cacheRead,
          ttfbMs: firstTokenAt ? firstTokenAt - startedAt : 0,
          totalMs: Date.now() - startedAt,
          stopReason: final.stopReason,
        });
        controller.close();
      } catch (err) {
        if (req.signal.aborted) {
          controller.close(); // 클라가 끊음 — 부분결과는 이미 전송됨
          return;
        }
        logLLM({ requestId, route: "generate", error: String(err), totalMs: Date.now() - startedAt });
        controller.error(err); // 클라가 부분결과 보존 후 처리
      }
    },
    cancel() {
      meta.abort(); // 소비 측 취소 시 상류 중단
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Request-Id": requestId,
    },
  });
}
