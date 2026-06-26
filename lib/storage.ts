// 게스트 LocalStorage 저장 (ARCHITECTURE_v2 §7).
// 키 분리(index/conv/settings) + schemaVersion 마이그레이션 + 탭 동기화. SSR-safe.
import {
  SCHEMA_VERSION,
  type Conversation,
  type ConversationMeta,
  type ContextProfile,
  type ProfileMeta,
  type Settings,
  type StoredConversation,
  type StoredProfile,
} from "@/types";

const INDEX_KEY = "transintent:index";
const CONV_PREFIX = "transintent:conv:";
const SETTINGS_KEY = "transintent:settings";
const PROFILES_INDEX_KEY = "transintent:profiles:index";
const PROFILE_PREFIX = "transintent:profile:";

const hasLS = () => typeof window !== "undefined" && !!window.localStorage;

function read<T>(key: string, fallback: T): T {
  if (!hasLS()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  if (!hasLS()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota 초과 등 — 호출부에서 정리 안내
  }
}

/** 마이그레이션 체인: schemaVersion 보고 1→2→… 순차 변환. 읽기 시 항상 통과. */
export function migrate(stored: StoredConversation): StoredConversation {
  // 예) if (stored.schemaVersion < 2) stored = { ...stored, schemaVersion: 2, ... };
  return { ...stored, schemaVersion: SCHEMA_VERSION };
}

export function listConversations(): ConversationMeta[] {
  return read<ConversationMeta[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadConversation(id: string): Conversation | null {
  const raw = read<StoredConversation | null>(CONV_PREFIX + id, null);
  if (!raw) return null;
  const m = migrate(raw);
  return {
    id: m.id,
    title: m.title,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    originalPrompt: m.originalPrompt,
    preset: m.preset,
    contexts: m.contexts,
    questions: m.questions,
    result: m.result,
    messages: m.messages,
    approxTokens: m.approxTokens,
  };
}

export function saveConversation(conv: Conversation): boolean {
  const stored: StoredConversation = { ...conv, schemaVersion: SCHEMA_VERSION };
  if (!write(CONV_PREFIX + conv.id, stored)) return false;
  const index = read<ConversationMeta[]>(INDEX_KEY, []).filter((m) => m.id !== conv.id);
  index.push({ id: conv.id, title: conv.title, updatedAt: conv.updatedAt });
  return write(INDEX_KEY, index);
}

/** 대화 제목 변경 (0003 인라인 rename). conv 본문 + 인덱스 동시 갱신. */
export function renameConversation(id: string, title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  const raw = read<StoredConversation | null>(CONV_PREFIX + id, null);
  if (raw) write(CONV_PREFIX + id, { ...raw, title: t });
  const index = read<ConversationMeta[]>(INDEX_KEY, []).map((m) =>
    m.id === id ? { ...m, title: t } : m,
  );
  return write(INDEX_KEY, index);
}

export function deleteConversation(id: string): void {
  if (hasLS()) {
    try {
      window.localStorage.removeItem(CONV_PREFIX + id);
    } catch {
      /* noop */
    }
  }
  const index = read<ConversationMeta[]>(INDEX_KEY, []).filter((m) => m.id !== id);
  write(INDEX_KEY, index);
}

export function loadSettings(): Settings {
  const s = read<Settings>(SETTINGS_KEY, { theme: "dark", lang: "ko", quality: "fast" });
  // 레거시 정규화: 구 정본(vivid 등) 저장값 → dark 폴백(0003 다크/라이트만 유효).
  if (s.theme !== "dark" && s.theme !== "light") s.theme = "dark";
  // quality 미보유(이전 스키마) → fast 기본.
  if (s.quality !== "fast" && s.quality !== "max") s.quality = "fast";
  return s;
}

export function saveSettings(s: Settings): boolean {
  return write(SETTINGS_KEY, s);
}

// ── My Context 프로필 (대화와 동일한 키 분리·schemaVersion·마이그레이션 패턴 재사용) ──

/** 프로필 마이그레이션 체인(대화 migrate와 동형 — 현재 v1 무변환 스탬프). */
export function migrateProfile(stored: StoredProfile): StoredProfile {
  return { ...stored, schemaVersion: SCHEMA_VERSION };
}

export function listProfiles(): ProfileMeta[] {
  return read<ProfileMeta[]>(PROFILES_INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadProfile(id: string): ContextProfile | null {
  const raw = read<StoredProfile | null>(PROFILE_PREFIX + id, null);
  if (!raw) return null;
  const m = migrateProfile(raw);
  return { id: m.id, name: m.name, contexts: m.contexts, createdAt: m.createdAt, updatedAt: m.updatedAt };
}

export function saveProfile(profile: ContextProfile): boolean {
  const stored: StoredProfile = { ...profile, schemaVersion: SCHEMA_VERSION };
  if (!write(PROFILE_PREFIX + profile.id, stored)) return false; // quota 초과 → 인덱스 미오염
  const index = read<ProfileMeta[]>(PROFILES_INDEX_KEY, []).filter((m) => m.id !== profile.id);
  index.push({ id: profile.id, name: profile.name, updatedAt: profile.updatedAt });
  return write(PROFILES_INDEX_KEY, index);
}

export function deleteProfile(id: string): void {
  if (hasLS()) {
    try {
      window.localStorage.removeItem(PROFILE_PREFIX + id);
    } catch {
      /* noop */
    }
  }
  const index = read<ProfileMeta[]>(PROFILES_INDEX_KEY, []).filter((m) => m.id !== id);
  write(PROFILES_INDEX_KEY, index);
}

/**
 * 탭 동기화: 다른 탭의 index/settings/conv/profile 변경을 구독. cleanup 함수 반환.
 * 모든 키를 공유 구독한다(구독자별 필터 없음) — 콜백은 가벼운 재조회(list*)라 과다 발화 비용이 무시 가능.
 */
export function onStorageSync(cb: () => void): () => void {
  if (!hasLS()) return () => {};
  const handler = (e: StorageEvent) => {
    if (
      !e.key ||
      e.key === INDEX_KEY ||
      e.key === SETTINGS_KEY ||
      e.key === PROFILES_INDEX_KEY ||
      e.key.startsWith(CONV_PREFIX) ||
      e.key.startsWith(PROFILE_PREFIX)
    ) {
      cb();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export const STORAGE_KEYS = { INDEX_KEY, CONV_PREFIX, SETTINGS_KEY, PROFILES_INDEX_KEY, PROFILE_PREFIX };
