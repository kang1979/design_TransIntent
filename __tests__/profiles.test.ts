// profiles.test.ts — My Context 프로필 저장 계층(키 분리·정렬·삭제·마이그레이션) + store 액션.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveProfile,
  loadProfile,
  listProfiles,
  deleteProfile,
  migrateProfile,
  STORAGE_KEYS,
} from "@/lib/storage";
import { SCHEMA_VERSION, type ContextItem, type ContextProfile, type StoredProfile } from "@/types";

const ctx = (label: string, value: string): ContextItem => ({
  id: `c-${label}`,
  category: "기타",
  label,
  value,
  source: "manual",
  enabled: true,
});

const makeProfile = (id: string, name: string, updatedAt = 1): ContextProfile => ({
  id,
  name,
  contexts: [ctx("톤", "친근"), ctx("대상", "초보자")],
  createdAt: 1,
  updatedAt,
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("profiles 저장 계층", () => {
  it("saveProfile → loadProfile 라운드트립(맥락 보존)", () => {
    const p = makeProfile("p1", "블로그 기본");
    expect(saveProfile(p)).toBe(true);
    const loaded = loadProfile("p1");
    expect(loaded).toMatchObject({ id: "p1", name: "블로그 기본" });
    expect(loaded?.contexts).toHaveLength(2);
    expect(loaded?.contexts[0]).toMatchObject({ label: "톤", value: "친근" });
  });

  it("listProfiles — updatedAt 내림차순 정렬", () => {
    saveProfile(makeProfile("a", "A", 10));
    saveProfile(makeProfile("b", "B", 30));
    saveProfile(makeProfile("c", "C", 20));
    expect(listProfiles().map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("deleteProfile — 본문·인덱스 동시 제거", () => {
    saveProfile(makeProfile("p1", "X"));
    saveProfile(makeProfile("p2", "Y"));
    deleteProfile("p1");
    expect(loadProfile("p1")).toBeNull();
    expect(listProfiles().map((m) => m.id)).toEqual(["p2"]);
    expect(localStorage.getItem(STORAGE_KEYS.PROFILE_PREFIX + "p1")).toBeNull();
  });

  it("loadProfile — 없는 id는 null", () => {
    expect(loadProfile("nope")).toBeNull();
  });

  it("migrateProfile — schemaVersion을 현재 버전으로 스탬프", () => {
    const stale = { ...makeProfile("p1", "X"), schemaVersion: 0 } as StoredProfile;
    expect(migrateProfile(stale).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("대화 인덱스 키와 분리(프로필 저장이 conv 인덱스를 오염하지 않음)", () => {
    saveProfile(makeProfile("p1", "X"));
    expect(localStorage.getItem(STORAGE_KEYS.INDEX_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROFILES_INDEX_KEY)).not.toBeNull();
  });

  it("saveProfile — 본문 write 실패(quota) 시 false, 인덱스 미오염", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveProfile(makeProfile("p1", "X"))).toBe(false);
    vi.restoreAllMocks();
    expect(listProfiles()).toEqual([]);
  });
});

describe("useProfiles store", () => {
  it("saveAsProfile → 목록 반영, 빈 이름/맥락은 거부", async () => {
    const { useProfiles } = await import("@/lib/profiles-store");
    useProfiles.setState({ profiles: [], hydrated: false });

    expect(useProfiles.getState().saveAsProfile("", [ctx("톤", "친근")])).toBe(false);
    expect(useProfiles.getState().saveAsProfile("이름", [])).toBe(false);

    expect(useProfiles.getState().saveAsProfile("내 프로필", [ctx("톤", "친근")])).toBe(true);
    expect(useProfiles.getState().profiles.some((p) => p.name === "내 프로필")).toBe(true);
  });
});
