// 목(mock) 생성 엔진 — MOCK_LLM 모드에서 API 키 없이 결정적 결과를 반환.
// 실제 OpenAI 연결은 lib/llm/engine.ts가 이 모듈과 동일 시그니처로 스왑.
// 결정성 보장: Math.random()/Date.now() 미사용(입력으로만 분기).
import type { ContextItem, IntentBrief, Message, Preset, Question } from "@/types";

type Seed = Omit<Question, "id" | "skipped" | "answer">;

const BASE: Seed[] = [
  { text: "이 결과물의 주요 목적은 무엇인가요?", type: "single", options: ["정보 전달", "설득", "창작", "분석", "실무 산출물"] },
  { text: "예상 독자/대상은 누구인가요?", type: "single", options: ["일반 대중", "전문가", "내부 팀", "본인", "고객"] },
  { text: "원하는 톤/스타일은? (복수 선택)", type: "multi", options: ["친근하게", "전문적으로", "간결하게", "상세하게", "설득력 있게"] },
  { text: "출력 형식 선호가 있나요?", type: "single", options: ["자유 형식", "목록", "표", "단계별 가이드", "에세이"] },
  { text: "분량은 어느 정도가 좋을까요?", type: "single", options: ["짧게", "보통", "길게", "상관없음"] },
  { text: "꼭 포함하거나 피해야 할 제약이 있나요? (선택)", type: "short" },
];

// preset별 도메인 특화 질문(3~4개). mockQuestions가 BASE 상위 2개 다음에 우선 배치한다.
const BY_PRESET: Record<Preset, Seed[]> = {
  writing: [
    { text: "어떤 문서 유형인가요?", type: "single", options: ["블로그", "이메일", "보도자료", "기사/칼럼", "소셜 포스트", "기타"] },
    { text: "글의 관점(인칭)은?", type: "single", options: ["1인칭", "2인칭", "3인칭", "상관없음"] },
    { text: "꼭 다룰 핵심 메시지나 소재가 있나요? (선택)", type: "short" },
  ],
  coding: [
    { text: "대상 언어/스택은?", type: "short" },
    { text: "코드 외 무엇이 더 필요한가요?", type: "multi", options: ["설명 주석", "테스트", "사용 예시", "성능 고려", "에러 처리"] },
    { text: "실행/대상 환경은?", type: "single", options: ["브라우저", "Node.js", "모바일", "서버/백엔드", "CLI", "상관없음"] },
    { text: "지켜야 할 코드 스타일·규약이 있나요? (선택)", type: "short" },
  ],
  image: [
    { text: "원하는 비주얼 스타일은? (복수 선택)", type: "multi", options: ["사실적", "일러스트", "미니멀", "3D", "수채화", "애니메이션풍"] },
    { text: "구도/화면비는?", type: "single", options: ["정사각형", "가로(16:9)", "세로(9:16)", "클로즈업", "와이드", "상관없음"] },
    { text: "색감/분위기는?", type: "single", options: ["밝고 선명", "차분/파스텔", "어둡고 무거움", "흑백/모노", "상관없음"] },
  ],
  research: [
    { text: "근거/출처를 포함할까요?", type: "single", options: ["반드시", "가능하면", "불필요"] },
    { text: "어떤 관점에서 다룰까요?", type: "single", options: ["중립/균형", "비판적 검토", "찬성 입장", "반대 입장", "상관없음"] },
    { text: "분석 깊이는?", type: "single", options: ["핵심 요약", "표준 분석", "심층 분석"] },
  ],
  planning: [
    { text: "계획의 범위/규모는?", type: "single", options: ["개인", "소규모 팀", "부서/조직", "대규모 프로젝트", "상관없음"] },
    { text: "산출물의 타임라인이 있나요? (선택)", type: "short" },
    { text: "가용 리소스나 제약(예산·인원)이 있나요? (선택)", type: "short" },
  ],
};

const slug = (s: string) =>
  s.replace(/[^a-z0-9가-힣]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 32).toLowerCase();

/** 객관식 질문 N개 생성. exclude(id 목록)는 "질문 더 받기"에서 기존 질문 제외용. */
export function mockQuestions(opts: { prompt: string; preset?: Preset; exclude?: string[] }): Question[] {
  // preset 질문이 상위 5개 안에 들어오도록 우선 배치: 핵심 BASE 2개(목적·대상) → preset → 나머지 BASE.
  const presetSeeds = opts.preset ? BY_PRESET[opts.preset] : [];
  const pool: Seed[] = opts.preset ? [BASE[0], BASE[1], ...presetSeeds, ...BASE.slice(2)] : BASE;
  const exclude = new Set(opts.exclude ?? []);
  const out: Question[] = [];
  for (const seed of pool) {
    const id = `q-${opts.preset ?? "base"}-${slug(seed.text)}`;
    if (exclude.has(id)) continue;
    out.push({ id, skipped: false, ...seed });
    if (out.length >= 5) break;
  }
  return out;
}

/** Stage A 목: 맥락/메시지에서 결정적 IntentBrief를 추출(입력으로만 분기). */
export function mockIntent(contexts: ContextItem[], messages: Message[], lang: "ko" | "en"): IntentBrief {
  const enabled = contexts.filter((c) => c.enabled);
  const find = (cat: string) => enabled.filter((c) => c.category.includes(cat)).map((c) => c.value).join(", ");
  const reqValue = enabled.find((c) => c.id === "ctx-request")?.value ?? "";
  const extras = messages.filter((m) => m.role === "user").map((m) => m.content);

  const goal = find("목표") || reqValue || (lang === "en" ? "the user's request" : "사용자의 요청");
  const audience = find("대상") || (lang === "en" ? "a general reader" : "일반 독자");
  const tone = find("톤");
  const output = find("출력") || find("분량");
  const constraint = find("제약");

  if (lang === "en") {
    return {
      goal,
      audience,
      implicitNeeds: [
        "Be concrete and immediately usable rather than generic.",
        tone ? `Match the requested tone: ${tone}.` : "Keep a tone appropriate to the audience.",
        ...extras.map((e) => `Honor the follow-up request: ${e}`),
      ].filter(Boolean),
      targetAI: undefined,
      successCriteria: [
        `Clearly serves the goal: ${goal}.`,
        `Fits the audience: ${audience}.`,
        output ? `Respects the output preference: ${output}.` : "Has a clear, well-structured output spec.",
        constraint ? `Observes the constraint: ${constraint}.` : "Avoids unsupported claims.",
      ],
      risks: ["Staying too vague to act on", "Ignoring the stated audience or constraints"],
      recommendedStructure: "role, context, task, output format, constraints",
    };
  }
  return {
    goal,
    audience,
    implicitNeeds: [
      "막연하지 않고 구체적이며 바로 쓸 수 있을 것.",
      tone ? `요청한 톤을 지킬 것: ${tone}.` : "대상에 맞는 톤을 유지할 것.",
      ...extras.map((e) => `후속 요청을 반영할 것: ${e}`),
    ].filter(Boolean),
    targetAI: undefined,
    successCriteria: [
      `목표를 분명히 달성: ${goal}.`,
      `대상에 적합: ${audience}.`,
      output ? `출력 선호 반영: ${output}.` : "명확하고 구조화된 출력 형식을 가질 것.",
      constraint ? `제약 준수: ${constraint}.` : "근거 없는 단정을 피할 것.",
    ],
    risks: ["행동 불가능할 만큼 막연함", "명시된 대상/제약을 무시함"],
    recommendedStructure: "역할, 맥락, 작업, 출력 형식, 제약",
  };
}

/** 맥락/메시지(+선택 brief)를 구조화 메타프롬프트 텍스트로 조립(결정적). 스트리밍이 청크로 소비. */
export function mockMetaPrompt(
  contexts: ContextItem[],
  messages: Message[],
  lang: "ko" | "en",
  brief?: IntentBrief,
): string {
  const enabled = contexts.filter((c) => c.enabled);
  const find = (cat: string) => enabled.filter((c) => c.category.includes(cat)).map((c) => c.value).join(", ");
  const extra = messages.filter((m) => m.role === "user").map((m) => m.content).join(" / ");

  if (lang === "en") {
    return [
      "# Role",
      `You are an expert assistant tailored to: ${brief?.goal || find("역할") || "the user's request"}.`,
      brief ? `Audience: ${brief.audience}.` : "",
      "\n# Context",
      ...enabled.map((c) => `- ${c.label}: ${c.value}`),
      extra ? `- Extra: ${extra}` : "",
      "\n# Task",
      brief?.goal || find("목표") || "Produce the requested result with high quality.",
      brief?.implicitNeeds.length ? ["", "Also account for:", ...brief.implicitNeeds.map((n) => `- ${n}`)].join("\n") : "",
      "\n# Output format",
      brief?.recommendedStructure || find("출력") || "Clear, well-structured.",
      "\n# Constraints",
      ...(brief?.successCriteria.length
        ? brief.successCriteria.map((c) => `- ${c}`)
        : [find("제약") || "Be accurate and avoid unsupported claims."]),
    ].filter(Boolean).join("\n");
  }
  return [
    "# 역할",
    `당신은 다음에 최적화된 전문 어시스턴트입니다: ${brief?.goal || find("역할") || "사용자의 요청"}.`,
    brief ? `대상: ${brief.audience}.` : "",
    "\n# 맥락",
    ...enabled.map((c) => `- ${c.label}: ${c.value}`),
    extra ? `- 추가 요청: ${extra}` : "",
    "\n# 작업",
    brief?.goal || find("목표") || "요청한 결과물을 높은 품질로 생성하세요.",
    brief?.implicitNeeds.length ? ["", "다음도 반영하세요:", ...brief.implicitNeeds.map((n) => `- ${n}`)].join("\n") : "",
    "\n# 출력 형식",
    brief?.recommendedStructure || find("출력") || "명확하고 구조화된 형식.",
    "\n# 제약",
    ...(brief?.successCriteria.length
      ? brief.successCriteria.map((c) => `- ${c}`)
      : [find("제약") || "정확성을 지키고 근거 없는 단정을 피하세요."]),
  ].filter(Boolean).join("\n");
}

/** Stage C 목: 초안을 결정적으로 "정제"(rubric 충족 체크리스트를 덧붙인 최종본). */
export function mockCritique(draft: string, brief: IntentBrief, lang: "ko" | "en"): string {
  const heading = lang === "en" ? "# Quality checklist" : "# 품질 체크리스트";
  const items = brief.successCriteria.map((c) => `- [x] ${c}`);
  return [draft, "", heading, ...items].join("\n");
}

/** 텍스트를 토큰 비슷한 청크로 쪼갠다(스트리밍 시뮬레이션용, V5에서 사용). */
export function chunkText(text: string): string[] {
  return text.match(/\s*\S+|\s+/g) ?? [text];
}
