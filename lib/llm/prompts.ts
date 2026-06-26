// system/messages 빌더 — 안정 프리픽스(자동 캐싱)·user 역할만(§2) 정본.
// system = 안정 프리픽스(lang 미포함). 가변부(lang·prompt·preset·맥락·brief)는 user 메시지로.
import type OpenAI from "openai";
import type { ContextItem, IntentBrief, Message, Preset } from "@/types";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// 개행을 공백으로 정규화(§2로 인젝션은 차단되나, value의 개행이 마크다운 구조를 흉내내지 못하게).
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

// ── Stage A: 의도 분석(gpt-4.1-mini, function tool) ───────────────────────────
/** 의도 분석 system(안정 프리픽스). 요청+맥락 → 구조화 IntentBrief. */
export function buildIntentSystem(): string {
  return [
    "You are TransIntent's intent analyst — the first stage of a meta-prompt pipeline.",
    "Given a user's rough request plus their answers to clarifying questions, infer the underlying intent",
    "so a downstream generator can build an excellent, paste-ready meta-prompt.",
    "Read between the lines: surface the real goal, the audience, and the requirements the user did not state",
    "but that a domain expert would assume. Identify which AI chat the meta-prompt is likely headed to when discernible.",
    "Define concrete success criteria — these become the rubric the meta-prompt must satisfy.",
    "Be faithful to the provided context; infer reasonably but never invent specifics the context contradicts.",
    "Write all string values in the language given by the request's `lang` field (ko = Korean, en = English).",
    "Return the analysis by calling the provide_intent tool.",
  ].join("\n");
}

/** 의도 분석 user 메시지(가변부: 원문·맥락·대화). */
export function assembleIntentMessages(
  contexts: ContextItem[],
  messages: Message[],
  lang: "ko" | "en",
): ChatMessage[] {
  const enabled = contexts.filter((c) => c.enabled);
  const extras = messages.filter((m) => m.role === "user").map((m) => oneLine(m.content)).filter(Boolean);
  const lines = [`lang: ${lang}`, "", "# Context (request + answers)"];
  for (const c of enabled) lines.push(`- ${oneLine(c.label)}: ${oneLine(c.value)}`);
  if (extras.length) {
    lines.push("", "# Additional requests");
    for (const e of extras) lines.push(`- ${e}`);
  }
  return [{ role: "user", content: lines.join("\n") }];
}

// ── Stage B: 생성(gpt-4.1, 스트림) ───────────────────────────────────────────
/** 메타프롬프트 생성 system(안정 프리픽스 — lang/가변부 미포함). */
export function buildGenerateSystem(): string {
  return [
    "You are TransIntent's meta-prompt generator — a world-class prompt engineer.",
    "You receive a user's rough request, their structured answers, and an INTENT BRIEF analyzing what they really need.",
    "Produce a single high-quality, ready-to-use meta-prompt the user can paste into any AI chat to get an excellent result.",
    "Treat the intent brief as authoritative: satisfy every success criterion, address the implicit needs, and mitigate the listed risks.",
    "If a target AI is named, optimize the phrasing and structure for that model's strengths.",
    "Engineer the prompt, don't just reformat the context: assign a precise expert role, give actionable task steps,",
    "specify the exact output format, and add only constraints the context or brief supports.",
    "Be specific and faithful; never invent facts the context does not support, and never leave bracketed placeholders.",
    "Output ONLY the meta-prompt itself as Markdown — no preamble, no explanation, no commentary, no rejected drafts.",
    "Write the meta-prompt in the language given by the request's `lang` field (ko = Korean, en = English).",
  ].join("\n");
}

/** fast 모드 생성 system — 의도분석을 인라인으로 흡수(별도 LLM 왕복 없이 단일 스트림으로 TTFB 단축).
 * 모델이 내부적으로 의도를 추론하되, 출력은 최종 메타프롬프트만(추론 누출 금지). */
export function buildFastGenerateSystem(): string {
  return [
    "You are TransIntent's meta-prompt generator — a world-class prompt engineer.",
    "You receive a user's rough request plus their structured answers. There is NO separate intent brief — infer the intent yourself.",
    "Silently read between the lines first: the user's real goal, the audience, the requirements they did not state",
    "but that a domain expert would assume, concrete success criteria the result must satisfy, common risks to avoid,",
    "and the AI chat it is likely headed to. Do not write any of this analysis — output only the final meta-prompt.",
    "Then produce a single high-quality, ready-to-use meta-prompt the user can paste into any AI chat to get an excellent result.",
    "Satisfy every inferred success criterion, address the implicit needs, and mitigate the likely risks.",
    "If a target AI is named, optimize the phrasing and structure for that model's strengths.",
    "Engineer the prompt, don't just reformat the context: assign a precise expert role, give actionable task steps,",
    "specify the exact output format, and add only constraints the context supports.",
    "Be specific and faithful; never invent facts the context does not support, and never leave bracketed placeholders.",
    "Output ONLY the meta-prompt itself as Markdown — no analysis, no preamble, no explanation, no commentary, no rejected drafts.",
    "Write the meta-prompt in the language given by the request's `lang` field (ko = Korean, en = English).",
  ].join("\n");
}

/** IntentBrief를 user 메시지용 섹션으로 직렬화. */
function briefSection(brief: IntentBrief): string[] {
  const list = (xs: string[]) => xs.map((x) => `  - ${oneLine(x)}`);
  const lines = [
    "# Intent brief",
    `- Goal: ${oneLine(brief.goal)}`,
    `- Audience: ${oneLine(brief.audience)}`,
  ];
  if (brief.targetAI) lines.push(`- Target AI: ${oneLine(brief.targetAI)}`);
  if (brief.implicitNeeds.length) lines.push("- Implicit needs:", ...list(brief.implicitNeeds));
  if (brief.successCriteria.length) lines.push("- Success criteria (must satisfy):", ...list(brief.successCriteria));
  if (brief.risks.length) lines.push("- Risks to avoid:", ...list(brief.risks));
  if (brief.recommendedStructure) lines.push(`- Recommended structure: ${oneLine(brief.recommendedStructure)}`);
  return lines;
}

/** 활성 맥락 + 대화 + (선택)의도 브리프를 user 역할 단일 메시지로 직렬화(§2). */
export function assembleGenerateMessages(
  contexts: ContextItem[],
  messages: Message[],
  lang: "ko" | "en",
  brief?: IntentBrief,
): ChatMessage[] {
  const enabled = contexts.filter((c) => c.enabled);
  const extras = messages.filter((m) => m.role === "user").map((m) => oneLine(m.content)).filter(Boolean);

  const lines = [`lang: ${lang}`, "", "# Context"];
  for (const c of enabled) lines.push(`- ${oneLine(c.label)}: ${oneLine(c.value)}`);
  if (extras.length) {
    lines.push("", "# Additional requests");
    for (const e of extras) lines.push(`- ${e}`);
  }
  if (brief) lines.push("", ...briefSection(brief));
  return [{ role: "user", content: lines.join("\n") }];
}

// ── Stage C: 정제 루프(max 모드) ─────────────────────────────────────────────
/** 자기검토 system(안정 프리픽스). 초안을 rubric으로 채점·약점 보강한 최종본만 출력. */
export function buildCritiqueSystem(): string {
  return [
    "You are TransIntent's meta-prompt editor — the refinement stage.",
    "You receive an INTENT BRIEF (with success criteria) and a DRAFT meta-prompt.",
    "Silently evaluate the draft against every success criterion and the implicit needs, find its weakest points,",
    "and rewrite it into a stronger final meta-prompt: more specific role, clearer task steps, tighter output spec,",
    "fuller coverage of the criteria, and the risks mitigated — without adding facts the context does not support.",
    "Keep what already works; only change what makes it better. Do not pad length for its own sake.",
    "Output ONLY the improved final meta-prompt as Markdown — no critique, no preamble, no commentary, no diff.",
    "Write it in the language given by the request's `lang` field (ko = Korean, en = English).",
  ].join("\n");
}

/** 정제 user 메시지: 브리프 + 초안. 초안은 모델 출력이지만 user 역할로 주입(§2). */
export function assembleCritiqueMessages(
  brief: IntentBrief,
  draft: string,
  lang: "ko" | "en",
): ChatMessage[] {
  const lines = [`lang: ${lang}`, "", ...briefSection(brief), "", "# Draft meta-prompt", draft];
  return [{ role: "user", content: lines.join("\n") }];
}

/** 질문 생성 system(안정 프리픽스). 고정 축 나열이 아니라 빈/모호 지점을 읽어 고레버리지 질문부터. */
export function buildQuestionsSystem(): string {
  return [
    "You are TransIntent's clarifying-question generator — the intake stage of a meta-prompt pipeline.",
    "Given a user's rough one-line request, find the gaps and ambiguities whose answers would most change the",
    "quality of the final result, and ask the highest-leverage questions about them first.",
    "Prioritize what the request leaves unsaid or ambiguous over generic boilerplate; skip anything the request already makes clear.",
    "Generate at most 5 questions. Prefer single/multi choice with 3-6 concrete, mutually distinct options the user can pick fast;",
    "use a short-answer question only when fixed options genuinely cannot capture the answer.",
    "Order questions by impact — the one whose answer most shapes the output comes first.",
    "When the request includes a `preset`, use that domain's axes as hints for where gaps usually hide (not a fixed checklist):",
    "- writing: document type, point of view, target reader, tone, key message",
    "- coding: language/stack, runtime/target environment, deliverables (tests/comments/examples), style conventions",
    "- image: visual style, composition/aspect ratio, color/mood, subject details",
    "- research: source/citation needs, perspective/stance, analysis depth, data format",
    "- planning: scope/scale, timeline, available resources/constraints, stakeholders",
    "Write the questions in the language given by the request's `lang` field (ko = Korean, en = English).",
    "Return them by calling the provide_questions tool.",
  ].join("\n");
}

/** 질문 생성 user 메시지(가변부: prompt·preset·lang). */
export function buildQuestionsUserMessage(prompt: string, preset: Preset | undefined, lang: "ko" | "en"): string {
  return [`lang: ${lang}`, preset ? `preset: ${preset}` : "", `request: ${prompt}`].filter(Boolean).join("\n");
}
