// 실제 OpenAI 엔진 — 목(lib/llm/mock.ts)과 대응되는 시그니처로 스왑.
// 불변규칙: §2 user 역할만 · §3 텍스트 델타 변환은 라우트에서 · §7 금지 파라미터 없음.
import type OpenAI from "openai";
import { encode } from "gpt-tokenizer";
import { z } from "zod";
import type { ContextItem, IntentBrief, Message, Preset, Question } from "@/types";
import { getClient, MODEL_GENERATE, MODEL_QUESTIONS } from "./client";
import { toMetaStream, type MetaStream } from "./stream";
import {
  assembleCritiqueMessages,
  assembleGenerateMessages,
  assembleIntentMessages,
  buildCritiqueSystem,
  buildFastGenerateSystem,
  buildGenerateSystem,
  buildIntentSystem,
  buildQuestionsSystem,
  buildQuestionsUserMessage,
} from "./prompts";

const GEN_MAX_TOKENS = 8192; // 스트리밍 출력 여유

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// system은 안정 프리픽스(OpenAI는 1024토큰↑ 프리픽스를 자동 캐싱). messages 앞에 system 역할로 prepend.
function withSystem(system: string, messages: ChatMessage[]): ChatMessage[] {
  return [{ role: "system", content: system }, ...messages];
}

// ── Stage A: 의도 분석(gpt-4.1-mini, function tool 강제) ──────────────────────
const IntentInput = z.object({
  goal: z.string().min(1),
  audience: z.string().min(1),
  implicitNeeds: z.array(z.string()).default([]),
  targetAI: z.string().optional(),
  successCriteria: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  recommendedStructure: z.string().default(""),
});

const INTENT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "provide_intent",
    description: "Return the structured intent analysis for the meta-prompt generator.",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What the user is really trying to achieve, more specific than the raw request." },
        audience: { type: "string", description: "Who the final result is for." },
        implicitNeeds: { type: "array", items: { type: "string" }, description: "Unstated but quality-critical requirements." },
        targetAI: { type: "string", description: "The AI chat the meta-prompt is likely headed to, if discernible." },
        successCriteria: { type: "array", items: { type: "string" }, description: "Concrete criteria a great result must satisfy (the rubric)." },
        risks: { type: "array", items: { type: "string" }, description: "Common failure or misunderstanding points to avoid." },
        recommendedStructure: { type: "string", description: "Recommended section layout for the meta-prompt." },
      },
      // 핵심 3개 외 나머지도 required로 둬 모델이 더 자주 채우게 한다(누락 시 Zod default가 보강).
      required: ["goal", "audience", "implicitNeeds", "successCriteria", "risks", "recommendedStructure"],
    },
  },
};

/** function tool 호출 인자(JSON 문자열) 추출. 없거나 JSON이 깨지면 throw(원인 보존). */
function toolArgs(msg: OpenAI.Chat.Completions.ChatCompletion.Choice["message"], label: string): unknown {
  const call = msg.tool_calls?.find((c) => c.type === "function");
  if (!call || call.type !== "function") throw new Error(`${label}: tool_call 응답 없음`);
  try {
    return JSON.parse(call.function.arguments);
  } catch (err) {
    // 모델이 드물게 깨지거나 잘린 JSON을 반환 → 상위 재시도가 흡수.
    throw new Error(`${label}: tool 인자 JSON 파싱 실패`, { cause: err });
  }
}

type Completion = OpenAI.Chat.Completions.ChatCompletion;

/** function-tool 호출+추출을 최대 2회 시도. 깨진 JSON/Zod 실패는 대개 전이적이라 재호출로 해소. */
async function callWithToolRetry<T>(
  call: () => Promise<Completion>,
  extract: (msg: Completion["choices"][number]["message"]) => T,
  label: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await call();
    try {
      return extract(res.choices[0].message);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`${label}: tool 응답 파싱 재시도 실패`, { cause: lastErr });
}

/** 의도 분석(gpt-4.1-mini). 맥락+대화 → 구조화 IntentBrief. 목(mockIntent)과 동일 반환형.
 * signal: 클라가 스트림 시작 전(의도분석 단계)에 끊으면 상류 호출도 중단(낭비 차단). */
export async function analyzeIntent(
  contexts: ContextItem[],
  messages: Message[],
  lang: "ko" | "en",
  signal?: AbortSignal,
): Promise<IntentBrief> {
  const parsed = await callWithToolRetry(
    () =>
      getClient().chat.completions.create(
        {
          model: MODEL_QUESTIONS,
          max_completion_tokens: 1024,
          messages: withSystem(buildIntentSystem(), assembleIntentMessages(contexts, messages, lang)),
          tools: [INTENT_TOOL],
          tool_choice: { type: "function", function: { name: "provide_intent" } },
        },
        { signal },
      ),
    (msg) => IntentInput.parse(toolArgs(msg, "의도 분석 실패")),
    "의도 분석 실패",
  );
  return {
    goal: parsed.goal,
    audience: parsed.audience,
    implicitNeeds: parsed.implicitNeeds,
    targetAI: parsed.targetAI,
    successCriteria: parsed.successCriteria,
    risks: parsed.risks,
    recommendedStructure: parsed.recommendedStructure,
  };
}

/** 호출 직전 입력 토큰 사전견적(진입부 ③). 로컬 토크나이저로 계산(OpenAI엔 countTokens API 없음).
 * brief가 있으면 실제 전송 페이로드 기준으로 견적. signal은 시그니처 보존용(로컬 계산이라 미사용). */
export async function countGenerateTokens(
  contexts: ContextItem[],
  messages: Message[],
  lang: "ko" | "en",
  brief?: IntentBrief,
  signal?: AbortSignal,
): Promise<number> {
  void signal; // 시그니처 보존용(로컬 토크나이저 계산이라 미사용)
  const payload = withSystem(buildGenerateSystem(), assembleGenerateMessages(contexts, messages, lang, brief));
  const text = payload.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  return encode(text).length;
}

/**
 * 메타프롬프트 스트림 생성(gpt-4.1). 라우트가 MetaStream(text/final/abort)을 소비.
 * brief 있으면(max) 브리프 기반 system, 없으면(fast) 의도분석을 인라인 흡수한 system을 써
 * 별도 의도분석 왕복 없이 단일 스트림으로 TTFB를 단축한다. signal: 클라 fetch 취소 → 상류 중단.
 */
export async function streamMetaPrompt(
  contexts: ContextItem[],
  messages: Message[],
  lang: "ko" | "en",
  brief?: IntentBrief,
  signal?: AbortSignal,
): Promise<MetaStream> {
  const system = brief ? buildGenerateSystem() : buildFastGenerateSystem();
  const stream = await getClient().chat.completions.create(
    {
      model: MODEL_GENERATE,
      max_completion_tokens: GEN_MAX_TOKENS,
      messages: withSystem(system, assembleGenerateMessages(contexts, messages, lang, brief)),
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal },
  );
  return toMetaStream(stream);
}

/**
 * Stage C(max 모드): 초안(비스트림) → rubric 자기검토 → 개선본 스트림(gpt-4.1).
 * 반환은 streamMetaPrompt와 동일한 MetaStream이라 라우트가 동일하게 소비한다.
 */
export async function critiqueAndStreamRevision(
  contexts: ContextItem[],
  messages: Message[],
  lang: "ko" | "en",
  brief: IntentBrief,
  signal?: AbortSignal,
): Promise<MetaStream> {
  // 1) 초안 생성(비스트림) — 최종 메타프롬프트만.
  const draftMsg = await getClient().chat.completions.create(
    {
      model: MODEL_GENERATE,
      max_completion_tokens: GEN_MAX_TOKENS,
      messages: withSystem(buildGenerateSystem(), assembleGenerateMessages(contexts, messages, lang, brief)),
    },
    { signal },
  );
  const draft = draftMsg.choices[0].message.content ?? "";

  // 2) rubric 자기검토 → 개선본 스트림.
  const stream = await getClient().chat.completions.create(
    {
      model: MODEL_GENERATE,
      max_completion_tokens: GEN_MAX_TOKENS,
      messages: withSystem(buildCritiqueSystem(), assembleCritiqueMessages(brief, draft, lang)),
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal },
  );
  return toMetaStream(stream);
}

// 질문 구조화 출력: function tool을 강제(tool_choice)하고 입력을 Zod로 검증.
const QuestionsInput = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().min(1),
        type: z.enum(["single", "multi", "short"]),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

const QUESTIONS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "provide_questions",
    description: "Return the clarifying questions to ask the user.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "1–5 clarifying questions.",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "The question text, in the requested language." },
              type: { type: "string", enum: ["single", "multi", "short"] },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Choices for single/multi questions (omit for short).",
              },
            },
            required: ["text", "type"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

// 질문 id: 목(mock.ts)과 동일 컨벤션(q-{preset|gen}-{slug}). exclude/카테고리 추정 호환.
const slug = (s: string) =>
  s
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .toLowerCase();

/** 객관식 질문 생성(gpt-4.1-mini). exclude(기존 id) 제외, 5개 상한. 목과 동일 반환형. */
export async function claudeQuestions(
  prompt: string,
  preset: Preset | undefined,
  exclude: string[] | undefined,
  lang: "ko" | "en",
): Promise<Question[]> {
  const { questions } = await callWithToolRetry(
    () =>
      getClient().chat.completions.create({
        model: MODEL_QUESTIONS,
        max_completion_tokens: 4096, // 한국어 5문항×옵션 JSON 잘림 방지
        messages: [
          { role: "system", content: buildQuestionsSystem() },
          { role: "user", content: buildQuestionsUserMessage(prompt, preset, lang) },
        ],
        tools: [QUESTIONS_TOOL],
        tool_choice: { type: "function", function: { name: "provide_questions" } },
      }),
    (msg) => QuestionsInput.parse(toolArgs(msg, "질문 생성 실패")),
    "질문 생성 실패",
  );

  // id는 slug 기반(위치 무관) — "질문 더 받기"의 exclude 일관성을 위해 위치 접미사를 쓰지 않는다.
  // 대신 배치 내 slug 충돌(자유 텍스트라 mock보다 확률↑)은 seen으로 건너뛰어 중복 id를 방지.
  const excludeSet = new Set(exclude ?? []);
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of questions) {
    const id = `q-${preset ?? "gen"}-${slug(q.text)}`;
    if (excludeSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    const options = q.type === "short" ? undefined : q.options?.filter(Boolean);
    out.push({ id, text: q.text, type: q.type, options, skipped: false });
    if (out.length >= 5) break;
  }
  return out;
}
