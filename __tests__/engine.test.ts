// 실제 OpenAI 엔진(lib/llm/engine) 단위테스트.
// SDK를 vi.mock으로 차단 → 키/네트워크 불필요(게이트 보존). params 캡처로 불변규칙 가드.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContextItem } from "@/types";

// 모듈 레벨 모킹: getClient()의 new OpenAI()이 이 클래스를 생성한다.
const create = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { analyzeIntent, claudeQuestions, countGenerateTokens, streamMetaPrompt } from "@/lib/llm/engine";
import type { IntentBrief } from "@/types";

const CTX: ContextItem[] = [
  { id: "1", category: "목표", label: "요청", value: "제주 여행 일정", source: "manual", enabled: true },
  { id: "2", category: "톤", label: "톤", value: "친근", source: "manual", enabled: false }, // 비활성 제외
];

const BRIEF: IntentBrief = {
  goal: "제주 3박4일 일정을 만든다",
  audience: "가족 여행자",
  implicitNeeds: ["이동 동선 고려"],
  successCriteria: ["일자별 일정이 명확할 것"],
  risks: ["막연함"],
  recommendedStructure: "역할, 맥락, 작업, 출력, 제약",
};

/** 비-system 메시지는 모두 user 역할(§2: 사용자 입력은 user로만). */
function onlyUserPayload(messages: { role: string }[]): boolean {
  return messages.filter((m) => m.role !== "system").every((m) => m.role === "user");
}

/** 금지 파라미터 부재 + 모델 ID 날짜접미사 없음(§7). */
function expectNoForbiddenParams(p: Record<string, unknown>) {
  for (const k of ["temperature", "top_p", "top_k", "budget_tokens"]) {
    expect(p).not.toHaveProperty(k);
  }
  expect(p.model).not.toMatch(/-\d{8}$/); // 날짜 접미사 없음
}

/** 텍스트 델타가 없어도 되는 가짜 OpenAI 스트림(파라미터 캡처용). */
function fakeStream() {
  return {
    controller: { abort: vi.fn() },
    async *[Symbol.asyncIterator]() {
      // 비어 있음 — 본 테스트는 호출 파라미터만 단언.
    },
  };
}

/** function tool 응답 모양. arguments는 JSON 문자열(OpenAI 계약). */
function toolResponse(name: string, args: unknown) {
  return {
    choices: [
      { message: { tool_calls: [{ type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" },
    ],
    model: "gpt-4.1-mini",
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  };
}

/** 깨진 JSON 인자를 담은 function tool 응답(모델이 드물게 반환). */
function badArgsResponse(name: string) {
  return {
    choices: [
      { message: { tool_calls: [{ type: "function", function: { name, arguments: "{bad json" } }] }, finish_reason: "tool_calls" },
    ],
    model: "gpt-4.1-mini",
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  };
}

beforeEach(() => {
  create.mockReset();
});

describe("countGenerateTokens", () => {
  it("로컬 토크나이저로 양의 입력 토큰 수를 반환(SDK 호출 없음)", async () => {
    const n = await countGenerateTokens(CTX, [], "ko");
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
    expect(create).not.toHaveBeenCalled(); // 견적은 로컬(OpenAI엔 countTokens API 없음)
  });
});

describe("streamMetaPrompt", () => {
  it("stream=true + system 역할 + signal 전달, 금지파라미터 없음", async () => {
    create.mockResolvedValue(fakeStream());
    const ctrl = new AbortController();
    await streamMetaPrompt(CTX, [], "ko", undefined, ctrl.signal);

    const [p, opts] = create.mock.calls[0];
    expect(p.model).toBe("gpt-4.1");
    expect(p.stream).toBe(true);
    expect(p.stream_options).toEqual({ include_usage: true });
    expect(p.max_completion_tokens).toBeGreaterThan(0);
    expect(p.messages[0].role).toBe("system"); // 안정 프리픽스
    expect(onlyUserPayload(p.messages)).toBe(true); // §2
    expect(opts).toEqual({ signal: ctrl.signal }); // 클라 취소 전파
    expectNoForbiddenParams(p);
  });

  it("brief가 있으면 user 메시지에 의도 브리프 섹션을 주입(§2: user 역할)", async () => {
    create.mockResolvedValue(fakeStream());
    await streamMetaPrompt(CTX, [], "ko", BRIEF);
    const [p] = create.mock.calls[0];
    const userMsg = p.messages.find((m: { role: string }) => m.role === "user");
    expect(onlyUserPayload(p.messages)).toBe(true);
    expect(userMsg.content).toContain("# Intent brief");
    expect(userMsg.content).toContain("제주 3박4일 일정을 만든다"); // goal
    expect(userMsg.content).toContain("일자별 일정이 명확할 것"); // success criterion
    expect(p.messages[0].content).not.toContain("제주"); // 가변부(brief)는 system 프리픽스 밖
  });
});

describe("analyzeIntent", () => {
  it("function tool 강제·system역할·user역할로 IntentBrief 파싱, 금지파라미터 없음", async () => {
    create.mockResolvedValue(
      toolResponse("provide_intent", {
        goal: "제주 일정",
        audience: "가족",
        implicitNeeds: ["동선"],
        successCriteria: ["명확한 일정"],
        risks: ["막연함"],
        recommendedStructure: "역할/맥락/작업",
      }),
    );
    const brief = await analyzeIntent(CTX, [], "ko");
    expect(brief.goal).toBe("제주 일정");
    expect(brief.successCriteria).toEqual(["명확한 일정"]);

    const p = create.mock.calls[0][0];
    expect(p.model).toBe("gpt-4.1-mini");
    expect(p.tool_choice).toEqual({ type: "function", function: { name: "provide_intent" } });
    expect(p.tools[0].type).toBe("function");
    expect(p.messages[0].role).toBe("system");
    expect(onlyUserPayload(p.messages)).toBe(true);
    const userMsg = p.messages.find((m: { role: string }) => m.role === "user");
    expect(userMsg.content).not.toContain("친근"); // 비활성 맥락 제외
    expectNoForbiddenParams(p);
  });

  it("tool_call 없으면 throw", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "no tool" }, finish_reason: "stop" }] });
    await expect(analyzeIntent(CTX, [], "ko")).rejects.toThrow();
  });

  it("깨진 JSON 인자는 1회 재시도 후 성공", async () => {
    create
      .mockResolvedValueOnce(badArgsResponse("provide_intent"))
      .mockResolvedValueOnce(
        toolResponse("provide_intent", {
          goal: "제주 일정",
          audience: "가족",
          implicitNeeds: [],
          successCriteria: ["명확"],
          risks: [],
          recommendedStructure: "역할",
        }),
      );
    const brief = await analyzeIntent(CTX, [], "ko");
    expect(brief.goal).toBe("제주 일정");
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("claudeQuestions", () => {
  it("tool_call 파싱·id 부여·5개 상한 + 강제 tool_choice/system·user역할", async () => {
    create.mockResolvedValue(
      toolResponse("provide_questions", {
        questions: Array.from({ length: 7 }, (_, i) => ({ text: `질문${i}`, type: "single", options: ["A", "B"] })),
      }),
    );
    const qs = await claudeQuestions("여행 일정", undefined, [], "ko");

    expect(qs).toHaveLength(5); // 상한
    expect(qs[0].id).toMatch(/^q-gen-/); // preset 없음 → gen
    expect(qs[0].skipped).toBe(false);
    expect(qs[0].options).toEqual(["A", "B"]);

    const p = create.mock.calls[0][0];
    expect(p.model).toBe("gpt-4.1-mini");
    expect(p.tool_choice).toEqual({ type: "function", function: { name: "provide_questions" } });
    expect(p.messages[0].role).toBe("system");
    expect(onlyUserPayload(p.messages)).toBe(true);
    expectNoForbiddenParams(p);
  });

  it("short 질문은 options 제거", async () => {
    create.mockResolvedValue(
      toolResponse("provide_questions", { questions: [{ text: "제약이 있나요?", type: "short", options: ["무시될값"] }] }),
    );
    const qs = await claudeQuestions("p", undefined, [], "ko");
    expect(qs[0].type).toBe("short");
    expect(qs[0].options).toBeUndefined();
  });

  it("exclude(기존 id)는 결과에서 제외", async () => {
    create.mockResolvedValue(
      toolResponse("provide_questions", {
        questions: [
          { text: "목적은", type: "single", options: ["A"] },
          { text: "대상은", type: "single", options: ["B"] },
        ],
      }),
    );
    const id0 = "q-gen-목적은"; // slug 컨벤션
    const qs = await claudeQuestions("p", undefined, [id0], "ko");
    expect(qs.some((q) => q.id === id0)).toBe(false);
    expect(qs.some((q) => q.id === "q-gen-대상은")).toBe(true);
  });

  it("preset이 id 접두사에 반영", async () => {
    create.mockResolvedValue(toolResponse("provide_questions", { questions: [{ text: "스택은", type: "short" }] }));
    const qs = await claudeQuestions("p", "coding", [], "ko");
    expect(qs[0].id).toMatch(/^q-coding-/);
  });

  it("tool_call 없으면 throw", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "no tool" }, finish_reason: "stop" }] });
    await expect(claudeQuestions("p", undefined, [], "ko")).rejects.toThrow();
  });

  it("깨진 JSON 인자는 1회 재시도 후 성공", async () => {
    create
      .mockResolvedValueOnce(badArgsResponse("provide_questions"))
      .mockResolvedValueOnce(
        toolResponse("provide_questions", { questions: [{ text: "목적은", type: "single", options: ["A", "B"] }] }),
      );
    const qs = await claudeQuestions("여행 일정", undefined, [], "ko");
    expect(qs).toHaveLength(1);
    expect(qs[0].text).toBe("목적은");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("2회 연속 깨진 JSON이면 throw", async () => {
    create.mockResolvedValue(badArgsResponse("provide_questions"));
    await expect(claudeQuestions("p", undefined, [], "ko")).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
