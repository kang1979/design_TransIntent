"use client";
// V8 히스토리 사이드바 (S1·S5, FR-8·9) — 0003_dark 리스킨.
// 브랜드 헤더 + 새 대화 + 내비(홈/탐색) + 시간대 그룹 히스토리(호버 메뉴·인라인 rename) + 설정 푸터.
// 서버/클라 첫 렌더 일치 보장: 초기 items = 빈 배열 → effect에서 localStorage 로드.
import { useEffect, useState, useCallback, useRef, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/store";
import {
  listConversations,
  loadConversation,
  deleteConversation,
  renameConversation,
  onStorageSync,
} from "@/lib/storage";
import { SAVED_EVENT } from "@/lib/persist";
import type { ConversationMeta } from "@/types";
import { BrandMark } from "@/components/common/BrandMark";
import { SettingsModal } from "@/components/common/SettingsModal";
import styles from "./Sidebar.module.css";

const DAY = 86_400_000;

/** updatedAt 기준 오늘/어제/이전 버킷으로 그룹화. */
function groupByTime(items: ConversationMeta[], now: number) {
  const buckets: { label: string; items: ConversationMeta[] }[] = [
    { label: "오늘", items: [] },
    { label: "어제", items: [] },
    { label: "이전", items: [] },
  ];
  for (const it of items) {
    const d = now - (it.updatedAt || 0);
    const idx = d < DAY ? 0 : d < 2 * DAY ? 1 : 2;
    buckets[idx].items.push(it);
  }
  return buckets.filter((b) => b.items.length > 0);
}

/** 히스토리/내비 사이드바. props 없음 — store/storage에서 직접 구동. */
export function Sidebar() {
  const router = useRouter();
  const activeId = useSession((s) => s.conversationId);
  const stage = useSession((s) => s.stage);
  const hydrate = useSession((s) => s.hydrate);
  const reset = useSession((s) => s.reset);
  const setStage = useSession((s) => s.setStage);
  const setTitle = useSession((s) => s.setTitle);

  const [items, setItems] = useState<ConversationMeta[]>([]);
  const [now, setNow] = useState(0); // 그룹화 기준 시각 — 클라에서만 설정(SSR 일치)
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(() => {
    setItems(listConversations());
    setNow(Date.now());
  }, []);

  useEffect(() => {
    Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => onStorageSync(refresh), [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(SAVED_EVENT, handler);
    return () => window.removeEventListener(SAVED_EVENT, handler);
  }, [refresh]);

  // 메뉴 열림 중 바깥 클릭 시 닫기.
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

  function handleNewChat() {
    reset();
    router.push("/");
  }

  function handleItemClick(id: string) {
    const conv = loadConversation(id);
    if (conv) {
      hydrate(conv);
      router.push("/c/" + id);
    } else {
      deleteConversation(id);
      refresh();
    }
  }

  function startRename(id: string, current: string) {
    setMenuId(null);
    setRenameId(id);
    setRenameValue(current);
    setTimeout(() => renameRef.current?.focus(), 0);
  }

  function commitRename() {
    if (!renameId) return;
    const v = renameValue.trim();
    if (v) {
      renameConversation(renameId, v);
      // 활성 대화 rename 시 store.title도 갱신 — 다음 자동저장이 prompt 파생 제목으로 덮어쓰지 않도록.
      if (renameId === activeId) setTitle(v);
      refresh();
    }
    setRenameId(null);
    setRenameValue("");
  }

  function handleRenameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setRenameId(null);
      setRenameValue("");
    }
  }

  // 메뉴 → 삭제 클릭 시 즉시 삭제하지 않고 확인 모달을 연다(LocalStorage라 복구 불가).
  function askDelete(id: string) {
    setMenuId(null);
    setDeleteId(id);
  }

  function confirmDelete() {
    const id = deleteId;
    if (!id) return;
    deleteConversation(id);
    refresh();
    setDeleteId(null);
    if (id === activeId) {
      reset();
      router.push("/");
    }
  }

  // 삭제 확인 모달: Escape 닫기 + 취소 버튼 초기 포커스(실수 삭제 방지).
  useEffect(() => {
    if (!deleteId) return;
    cancelDeleteRef.current?.focus();
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setDeleteId(null);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [deleteId]);

  const groups = groupByTime(items, now);
  const convToDelete = items.find((m) => m.id === deleteId) ?? null;

  return (
    <nav className={styles.root} aria-label="대화 히스토리">
      {/* 브랜드 — 클릭 시 새 대화로 이동 */}
      <button type="button" className={styles.brand} onClick={handleNewChat} aria-label="새 대화 시작 (홈)">
        <BrandMark size={34} />
        <div className={styles.brandText}>
          <span className={styles.brandName}>TransIntent</span>
          <span className={styles.brandSub}>META&nbsp;PROMPT&nbsp;STUDIO</span>
        </div>
      </button>

      {/* 새 대화 */}
      <div className={styles.newChatWrap}>
        <button type="button" className={styles.newChat} onClick={handleNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          새 대화
        </button>
      </div>

      {/* 내비게이션 */}
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navBtn}
          data-active={stage === "input" ? "true" : "false"}
          onClick={handleNewChat}
          aria-label="홈"
          title="홈"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.navBtn}
          data-active={stage === "explore" ? "true" : "false"}
          onClick={() => setStage("explore")}
          aria-label="프롬프트 라이브러리"
          title="프롬프트 라이브러리"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1.6" />
            <rect x="14" y="3" width="7" height="7" rx="1.6" />
            <rect x="3" y="14" width="7" height="7" rx="1.6" />
            <rect x="14" y="14" width="7" height="7" rx="1.6" />
          </svg>
        </button>
      </div>

      {/* 히스토리 */}
      <div className={styles.history}>
        {groups.length === 0 ? (
          <p className={styles.empty}>
            아직 저장된 대화가 없어요.
            <br />한 줄 요청으로 시작해 보세요.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className={styles.group}>
              <div className={styles.groupLabel}>{g.label}</div>
              <ul className={styles.list}>
                {g.items.map((it) => (
                  <li
                    key={it.id}
                    className={styles.row}
                    data-active={it.id === activeId ? "true" : "false"}
                  >
                    <svg className={styles.rowIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5z" />
                    </svg>

                    {renameId === it.id ? (
                      <input
                        ref={renameRef}
                        className={styles.renameInput}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleRenameKey}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="대화 이름 변경"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.rowTitle}
                          onClick={() => handleItemClick(it.id)}
                        >
                          {it.title}
                        </button>
                        <button
                          type="button"
                          className={`${styles.menuBtn} ${menuId === it.id ? styles.menuBtnOpen : ""}`}
                          aria-label="대화 메뉴"
                          aria-haspopup="menu"
                          aria-expanded={menuId === it.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuId(menuId === it.id ? null : it.id);
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="5" cy="12" r="1.7" />
                            <circle cx="12" cy="12" r="1.7" />
                            <circle cx="19" cy="12" r="1.7" />
                          </svg>
                        </button>
                      </>
                    )}

                    {menuId === it.id && (
                      <div className={styles.menu} role="menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          role="menuitem"
                          className={styles.menuItem}
                          onClick={() => startRename(it.id, it.title)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                          </svg>
                          이름 바꾸기
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`${styles.menuItem} ${styles.menuItemDanger}`}
                          onClick={() => askDelete(it.id)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                          </svg>
                          삭제하기
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* 대화 삭제 확인 모달 */}
      {convToDelete && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="대화 삭제 확인"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteId(null);
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff7a5c" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
              </svg>
            </div>
            <div className={styles.modalTitle}>이 대화를 삭제할까요?</div>
            <div className={styles.modalValue}>&ldquo;{convToDelete.title}&rdquo;</div>
            <div className={styles.modalActions}>
              <button ref={cancelDeleteRef} type="button" className={styles.cancelBtn} onClick={() => setDeleteId(null)}>
                취소
              </button>
              <button type="button" className={styles.deleteBtn} onClick={confirmDelete}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 설정 푸터 */}
      <div className={styles.footer}>
        <div className={styles.userRow}>
          <div className={styles.avatar} aria-hidden="true">U</div>
          <div className={styles.userMeta}>
            <span className={styles.userName}>게스트</span>
            <span className={styles.userSub}>로컬 저장 · 무료</span>
          </div>
          <button type="button" className={styles.settingsBtn} aria-label="설정" onClick={() => setSettingsOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </nav>
  );
}
