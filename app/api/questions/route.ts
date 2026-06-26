import { z } from "zod";
import { mockQuestions } from "@/lib/llm/mock";
import { claudeQuestions } from "@/lib/llm/engine";
import { logLLM } from "@/lib/llm/log";
import type { Question } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  preset: z.enum(["writing", "coding", "image", "research", "planning"]).optional(),
  exclude: z.array(z.string()).max(40).optional(),
  lang: z.enum(["ko", "en"]).default("ko"),
});

/** 목 먼저: MOCK_LLM=1 이거나 API 키가 없으면 결정적 목 질문을 반환. */
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
  const { prompt, preset, exclude, lang } = parsed.data;

  if (shouldUseMock()) {
    const questions: Question[] = mockQuestions({ prompt, preset, exclude });
    return Response.json(questions);
  }

  // 실제 OpenAI(gpt-4.1-mini). 사용자 입력은 user 역할로만 주입(§2). function tool 구조화 출력.
  // 진입부 ③ countTokens 견적은 생략: prompt가 Zod max(2000)로 좁게 제한돼 비용 폭주 위험이 낮음.
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const questions = await claudeQuestions(prompt, preset, exclude, lang);
    logLLM({ requestId, route: "questions", count: questions.length, totalMs: Date.now() - startedAt });
    return Response.json(questions);
  } catch (err) {
    logLLM({ requestId, route: "questions", error: String(err), totalMs: Date.now() - startedAt });
    return new Response("질문 생성에 실패했습니다.", { status: 502 });
  }
}
