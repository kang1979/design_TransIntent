import { describe, it, expect } from "vitest";
import { resolveOpen, adapters, pickOpenUrl } from "@/lib/deeplink";
import { AdapterSchema } from "@/lib/deeplink.types";
import type { ChatAdapter } from "@/lib/deeplink.types";

const base: ChatAdapter = {
  id: "x",
  label: "X",
  template: "https://x.test/?q={q}",
  fallbackUrl: "https://x.test/",
};

describe("deeplink resolveOpen", () => {
  it("template {q}를 encodeURIComponent로 치환", () => {
    const { url, needsFallback } = resolveOpen(base, "안녕 hi & 또");
    expect(needsFallback).toBe(false);
    expect(url).toBe(`https://x.test/?q=${encodeURIComponent("안녕 hi & 또")}`);
  });

  it("URL 길이 초과 시 폴백", () => {
    const { needsFallback } = resolveOpen({ ...base, maxUrlLength: 20 }, "x".repeat(50));
    expect(needsFallback).toBe(true);
  });

  it("maxUrlLength 오버라이드가 기본값(2000)을 대체", () => {
    const longish = "a".repeat(500);
    expect(resolveOpen(base, longish).needsFallback).toBe(false); // 기본 2000 이내
    expect(resolveOpen({ ...base, maxUrlLength: 100 }, longish).needsFallback).toBe(true);
  });

  it("forceFallback이면 항상 폴백(url=null)", () => {
    const { url, needsFallback } = resolveOpen(
      { ...base, template: null, forceFallback: true },
      "짧은 입력",
    );
    expect(url).toBeNull();
    expect(needsFallback).toBe(true);
  });
});

describe("pickOpenUrl — 프리필 신뢰 사이트만 프리필 URL", () => {
  it("prefillReliable 사이트는 프리필 URL을 연다", () => {
    expect(pickOpenUrl({ ...base, prefillReliable: true }, "hi")).toBe("https://x.test/?q=hi");
  });

  it("비프리필 사이트는 항상 깨끗한 fallbackUrl을 연다(붙여넣기 전제)", () => {
    expect(pickOpenUrl(base, "hi")).toBe("https://x.test/");
  });

  it("prefillReliable여도 길이 초과면 fallbackUrl", () => {
    expect(pickOpenUrl({ ...base, prefillReliable: true, maxUrlLength: 10 }, "x".repeat(50))).toBe(
      "https://x.test/",
    );
  });
});

describe("AdapterSchema 검증", () => {
  it("fallbackUrl 누락 시 거부", () => {
    const bad = { id: "a", label: "A", template: "https://a/?q={q}" };
    expect(AdapterSchema.safeParse(bad).success).toBe(false);
  });

  it("template에 {q} 없으면 거부(null은 허용)", () => {
    expect(
      AdapterSchema.safeParse({ ...base, template: "https://x.test/no-placeholder" }).success,
    ).toBe(false);
    expect(AdapterSchema.safeParse({ ...base, template: null }).success).toBe(true);
  });

  it("실제 어댑터 JSON이 스키마를 통과하고 Gemini는 강제 폴백", () => {
    expect(adapters.length).toBeGreaterThanOrEqual(4);
    const gemini = adapters.find((a) => a.id === "gemini");
    expect(gemini?.forceFallback).toBe(true);
    // 모든 어댑터에 fallbackUrl 필수
    expect(adapters.every((a) => typeof a.fallbackUrl === "string" && a.fallbackUrl.length > 0)).toBe(true);
  });

  it("프리필 가능한 어댑터는 어댑터별 maxUrlLength를 명시", () => {
    // template이 있는(프리필) 어댑터는 길이 한계를 어댑터별로 정의 — 미지정은 forceFallback인 경우만 허용.
    for (const a of adapters) {
      if (a.template) expect(typeof a.maxUrlLength).toBe("number");
    }
    expect(adapters.find((a) => a.id === "chatgpt")?.maxUrlLength).toBe(2048);
  });

  it("prefillReliable은 선택 필드 — 현재 활성 사이트는 전부 복사-우선(없음)", () => {
    expect(AdapterSchema.safeParse({ ...base, prefillReliable: true }).success).toBe(true);
    // 어떤 AI 챗도 URL 프리필이 신뢰 불가 → 활성 어댑터엔 prefillReliable 없음.
    expect(adapters.some((a) => a.prefillReliable)).toBe(false);
  });
});
