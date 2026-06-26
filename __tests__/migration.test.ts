// migration.test.ts — storage.migrate + 라운드트립 검증 (V9)
// - migrate가 옛 schemaVersion을 SCHEMA_VERSION으로 올리는지
// - saveConversation → localStorage에 옛 버전 직접 심기 → loadConversation → migrate 통과 확인
import { describe, it, expect, beforeEach } from "vitest";
import {
  migrate,
  saveConversation,
  loadConversation,
} from "@/lib/storage";
import { SCHEMA_VERSION, type Conversation, type StoredConversation } from "@/types";

beforeEach(() => localStorage.clear());

const makeConv = (id: string, title = "테스트"): Conversation => ({
  id,
  title,
  createdAt: 1000,
  updatedAt: 2000,
  originalPrompt: "원본 프롬프트",
  contexts: [],
  questions: [],
  result: { metaPrompt: "결과", version: 1 },
  messages: [],
});

describe("migrate 함수", () => {
  it("현재 버전 schemaVersion 0 → SCHEMA_VERSION으로 업그레이드", () => {
    const old: StoredConversation = { ...makeConv("m1"), schemaVersion: 0 };
    const migrated = migrate(old);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("이미 최신 schemaVersion이면 그대로 유지", () => {
    const current: StoredConversation = { ...makeConv("m2"), schemaVersion: SCHEMA_VERSION };
    const migrated = migrate(current);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("migrate는 데이터 필드를 손상하지 않는다", () => {
    const old: StoredConversation = { ...makeConv("m3", "유지"), schemaVersion: 0 };
    const migrated = migrate(old);
    expect(migrated.title).toBe("유지");
    expect(migrated.originalPrompt).toBe("원본 프롬프트");
    expect(migrated.result.metaPrompt).toBe("결과");
  });
});

describe("saveConversation → migrate → loadConversation 라운드트립", () => {
  it("정상 저장/로드 라운드트립", () => {
    const conv = makeConv("rt1");
    saveConversation(conv);
    const loaded = loadConversation("rt1");
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe("테스트");
    expect(loaded?.result.metaPrompt).toBe("결과");
  });

  it("localStorage에 옛 schemaVersion으로 직접 심은 뒤 loadConversation이 migrate 통과 반환", () => {
    // 옛 버전 데이터를 localStorage에 직접 심기
    const oldStored: StoredConversation = { ...makeConv("rt2"), schemaVersion: 0 };
    localStorage.setItem("transintent:conv:rt2", JSON.stringify(oldStored));
    // 인덱스에도 추가
    localStorage.setItem(
      "transintent:index",
      JSON.stringify([{ id: "rt2", title: "테스트", updatedAt: 2000 }]),
    );

    const loaded = loadConversation("rt2");
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("rt2");
    expect(loaded?.title).toBe("테스트");
  });

  it("없는 id → null 반환", () => {
    expect(loadConversation("does-not-exist")).toBeNull();
  });

  it("저장 후 localStorage에 schemaVersion이 SCHEMA_VERSION으로 기록된다", () => {
    saveConversation(makeConv("rt3"));
    const raw = localStorage.getItem("transintent:conv:rt3");
    const parsed = JSON.parse(raw!) as StoredConversation;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
