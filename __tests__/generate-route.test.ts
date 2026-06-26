// /api/generate 라우트 단위테스트 — 목 분기에서 mode별 출력 분기를 검증.
// 키 없이 동작(MOCK_LLM 경로). 스트림 본문을 text()로 모아 내용 단언.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import type { ContextItem } from "@/types";

const CTX: ContextItem[] = [
  { id: "ctx-request", category: "목표", label: "요청", value: "제주 여행 일정", source: "manual", enabled: true },
];

function reqWith(body: unknown): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // 목 경로 보장(키가 환경에 있어도 결정적 목 사용).
  vi.stubEnv("MOCK_LLM", "1");
});

describe("POST /api/generate (목 분기)", () => {
  it("text/plain 스트림으로 메타프롬프트 본문을 반환", async () => {
    const res = await POST(reqWith({ contexts: CTX, lang: "ko" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("# 역할");
    expect(text).toContain("제주 여행 일정"); // 의도 브리프의 goal 반영
  });

  it("mode=max면 정제 체크리스트가 붙고, fast면 붙지 않음", async () => {
    const fast = await (await POST(reqWith({ contexts: CTX, lang: "ko", mode: "fast" }))).text();
    const max = await (await POST(reqWith({ contexts: CTX, lang: "ko", mode: "max" }))).text();
    expect(fast).not.toContain("# 품질 체크리스트");
    expect(max).toContain("# 품질 체크리스트"); // Stage C 정제 루프 산출
    expect(max.startsWith(fast)).toBe(true); // max는 fast 초안을 보존하고 확장
  });

  it("빈 contexts는 400(진입부 ② 빈 입력 차단)", async () => {
    const res = await POST(reqWith({ contexts: [], lang: "ko" }));
    expect(res.status).toBe(400);
  });
});
