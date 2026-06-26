// V8 store ↔ storage 직렬화 헬퍼. SSR 안전(클라에서만 호출).
// 저장 트리거: store.subscribe에서 호출. 무한 루프 방지는 호출부에서 직렬화 동등 비교로 처리.
import { loadConversation, saveConversation } from "@/lib/storage";
import type { Conversation } from "@/types";
import type { SessionState } from "@/lib/store";

const MAX_TITLE_LEN = 40;

/** 같은 탭 저장 후 Sidebar 목록 갱신용 커스텀 이벤트명(AppClient↔Sidebar 공유). */
export const SAVED_EVENT = "transintent:saved";

/** store 스냅샷에서 직렬화에 필요한 필드만 추린 슬라이스 타입. preset은 optional 유지. */
// title은 선택적 — store 스냅샷은 항상 제공하지만, 단위테스트는 생략 가능(빈 제목 → prompt 파생).
type PersistSlice = Pick<SessionState,
  | "originalPrompt"
  | "conversationId"
  | "createdAt"
  | "questions"
  | "contexts"
  | "messages"
  | "metaPrompt"
  | "preset"
> & { title?: string };

/**
 * store 스냅샷 → Conversation 변환.
 * originalPrompt가 비었거나 conversationId가 ""이면 null 반환(저장 안 함).
 * 제목: 사용자가 rename한 store.title 우선, 없으면 originalPrompt에서 파생.
 */
export function toConversation(s: PersistSlice): Conversation | null {
  if (!s.originalPrompt.trim() || !s.conversationId) return null;

  const raw = s.originalPrompt.trim();
  const title = s.title?.trim()
    ? s.title.trim()
    : raw.length > MAX_TITLE_LEN
      ? raw.slice(0, MAX_TITLE_LEN) + "…"
      : raw;

  return {
    id: s.conversationId,
    title,
    createdAt: s.createdAt,
    updatedAt: Date.now(),
    originalPrompt: s.originalPrompt,
    preset: s.preset,
    questions: s.questions,
    contexts: s.contexts,
    messages: s.messages,
    result: {
      metaPrompt: s.metaPrompt,
      version: 1,
    },
  };
}

/**
 * updatedAt을 제외한 "내용" 동등성 비교(toConversation이 쓰는 필드만).
 * 복원(읽기 전용)은 저장본과 내용이 동일 → 저장을 건너뛰어 정렬 키(updatedAt)를 보존하기 위함.
 * ⚠️ toConversation이 쓰는 필드와 1:1로 유지할 것 — 새 저장 필드(예: result.editedMetaPrompt,
 *    approxTokens)를 store→toConversation에 연결하면 여기에도 추가해야 한다(누락 시 편집이
 *    "내용 동일"로 오판돼 저장이 잘못 skip → 편집 유실).
 */
function contentKey(c: Conversation): string {
  return JSON.stringify({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    originalPrompt: c.originalPrompt,
    preset: c.preset,
    questions: c.questions,
    contexts: c.contexts,
    messages: c.messages,
    metaPrompt: c.result.metaPrompt,
  });
}

/**
 * store 스냅샷을 localStorage에 저장.
 * 반환: true=저장됨/저장 불필요, false=저장 실패(용량 초과 등 — 호출부에서 고지).
 * 클라에서만 호출할 것 — storage.ts가 hasLS() 가드를 하지만, 이 함수는 브라우저 전용.
 *
 * 내용 보존 가드: 저장본과 내용이 동일하면 쓰기를 건너뛴다(updatedAt 보존).
 * 대화 클릭(hydrate) 시 subscribe가 발동해도 내용이 같으면 저장이 no-op이 되어
 * 정렬 순서(updatedAt 내림차순)가 유지된다. 실제 편집(질문/답변/맥락 변경)만 재저장→재정렬.
 */
export function persistSession(s: SessionState): boolean {
  const conv = toConversation(s);
  if (!conv) return true; // 저장 대상 아님은 실패 아님

  const existing = loadConversation(conv.id);
  if (existing && contentKey(existing) === contentKey(conv)) return true; // 내용 동일 → updatedAt 보존

  return saveConversation(conv); // saveConversation은 quota 초과 시 false
}
