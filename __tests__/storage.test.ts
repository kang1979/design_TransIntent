import { describe, it, expect, beforeEach } from "vitest";
import {
  saveConversation,
  loadConversation,
  listConversations,
  deleteConversation,
  loadSettings,
  saveSettings,
  migrate,
} from "@/lib/storage";
import { SCHEMA_VERSION, type Conversation, type StoredConversation } from "@/types";

const makeConv = (id: string, title: string, updatedAt = 1): Conversation => ({
  id,
  title,
  createdAt: 1,
  updatedAt,
  originalPrompt: "p",
  contexts: [],
  questions: [],
  result: { metaPrompt: "", version: 1 },
  messages: [],
});

describe("storage (key-split + migrate + index)", () => {
  beforeEach(() => localStorage.clear());

  it("저장/로드 — 본문은 conv 키로 분리 저장", () => {
    expect(saveConversation(makeConv("x", "제목"))).toBe(true);
    expect(loadConversation("x")?.title).toBe("제목");
    expect(localStorage.getItem("transintent:conv:x")).toBeTruthy();
  });

  it("인덱스는 updatedAt 내림차순 정렬", () => {
    saveConversation(makeConv("a", "A", 10));
    saveConversation(makeConv("b", "B", 20));
    expect(listConversations().map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("삭제 — 본문과 인덱스 항목 모두 제거", () => {
    saveConversation(makeConv("d", "D"));
    deleteConversation("d");
    expect(loadConversation("d")).toBeNull();
    expect(listConversations()).toHaveLength(0);
  });

  it("migrate — 현재 schemaVersion으로 스탬프", () => {
    const old = { ...makeConv("m", "M"), schemaVersion: 0 } as StoredConversation;
    expect(migrate(old).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("설정 기본값 + 저장", () => {
    expect(loadSettings()).toEqual({ theme: "dark", lang: "ko", quality: "fast" });
    saveSettings({ theme: "light", lang: "en", quality: "max" });
    expect(loadSettings().theme).toBe("light");
    expect(loadSettings().quality).toBe("max");
  });
});
