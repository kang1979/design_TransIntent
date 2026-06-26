"use client";
// 적용된 맥락 패널 (S2·S3, FR-3·4) — 0003_dark 리스킨.
// 맥락 카드(수정/삭제) + 삭제 확인 모달 + 직접 추가 + "변경사항으로 다시 생성".
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSession } from "@/lib/store";
import { useProfiles } from "@/lib/profiles-store";
import { onStorageSync } from "@/lib/storage";
import type { ContextItem } from "@/types";
import styles from "./ContextPanel.module.css";

const SOURCE_LABEL: Record<ContextItem["source"], string> = {
  question: "질문 답변",
  chat: "대화에서 추가",
  manual: "직접 추가",
};

/** 맥락 카드 — 질문 유래는 '수정' 시 해당 질문으로 이동, 그 외는 값 인라인 편집. + 삭제 요청. */
function ContextCard({ item, onAskDelete }: { item: ContextItem; onAskDelete: (id: string) => void }) {
  const updateContext = useSession((s) => s.updateContext);
  const questions = useSession((s) => s.questions);
  const focusQuestion = useSession((s) => s.focusQuestion);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const inputRef = useRef<HTMLInputElement>(null);

  // 질문에서 유래(`ctx-<questionId>`)하고 그 질문이 아직 있으면 이동 대상.
  const linkedQid =
    item.source === "question" && item.id.startsWith("ctx-") ? item.id.slice(4) : "";
  const isQuestionLinked = !!linkedQid && questions.some((q) => q.id === linkedQid);

  function startEdit() {
    setDraft(item.value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // 질문 유래면 해당 질문으로 이동, 아니면 인라인 편집(폴백).
  function handleEdit() {
    if (isQuestionLinked) focusQuestion(linkedQid);
    else startEdit();
  }
  function commit() {
    const t = draft.trim();
    if (t && t !== item.value) updateContext(item.id, { value: t });
    setEditing(false);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setDraft(item.value);
      setEditing(false);
    }
  }

  return (
    <div className={styles.card} data-disabled={!item.enabled ? "true" : "false"}>
      <div className={styles.cardBody}>
        <div className={styles.cardMain}>
          <div className={styles.category}>{item.label || item.category}</div>
          {editing ? (
            <input
              ref={inputRef}
              className={styles.valueInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
              aria-label={`"${item.label}" 값 편집`}
            />
          ) : (
            <div className={styles.value}>{item.value}</div>
          )}
          <div className={styles.source}>{SOURCE_LABEL[item.source]}</div>
        </div>
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.miniBtn}
            onClick={handleEdit}
            aria-label={isQuestionLinked ? "질문으로 이동" : "맥락 수정"}
            title={isQuestionLinked ? "질문으로 이동" : "수정"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.miniBtn} ${styles.miniDanger}`}
            onClick={() => onAskDelete(item.id)}
            aria-label="맥락 삭제"
            title="삭제"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContextPanel() {
  const contexts = useSession((s) => s.contexts);
  const addContext = useSession((s) => s.addContext);
  const addContexts = useSession((s) => s.addContexts);
  const removeContext = useSession((s) => s.removeContext);
  const contextsDirty = useSession((s) => s.contextsDirty);
  const stage = useSession((s) => s.stage);
  const requestRegen = useSession((s) => s.requestRegen);

  // My Context 프로필
  const profiles = useProfiles((s) => s.profiles);
  const hydrateProfiles = useProfiles((s) => s.hydrateProfiles);
  const saveAsProfile = useProfiles((s) => s.saveAsProfile);
  const removeProfile = useProfiles((s) => s.removeProfile);
  const getProfile = useProfiles((s) => s.getProfile);

  const [draft, setDraft] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null); // null = 저장폼 닫힘
  const profileInputRef = useRef<HTMLInputElement>(null);

  const activeCount = contexts.filter((c) => c.enabled).length;
  const ctxToDelete = contexts.find((c) => c.id === deleteId) ?? null;
  const canRegen = contextsDirty && stage === "result";

  function handleAdd() {
    const v = draft.trim();
    if (!v) return;
    // "레이블: 값" 형태면 분리, 아니면 레이블 "추가".
    const idx = v.indexOf(":");
    if (idx > 0 && idx <= 8) addContext(v.slice(0, idx).trim(), v.slice(idx + 1).trim());
    else addContext("추가", v);
    setDraft("");
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAdd();
    }
  }
  function confirmDelete() {
    if (deleteId) removeContext(deleteId);
    setDeleteId(null);
  }

  // 현재 활성 맥락을 프로필로 저장.
  function commitSaveProfile() {
    const name = (profileName ?? "").trim();
    const active = contexts.filter((c) => c.enabled);
    if (name && active.length > 0) saveAsProfile(name, active);
    setProfileName(null);
  }
  // 프로필 불러오기: 저장 맥락을 현재 세션에 manual 맥락으로 주입.
  function loadProfileById(id: string) {
    const p = getProfile(id);
    if (!p) return;
    addContexts(p.contexts.map((c) => ({ label: c.label, value: c.value, category: c.category, enabled: c.enabled })));
  }
  function onProfileKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commitSaveProfile();
    } else if (e.key === "Escape") {
      setProfileName(null);
    }
  }

  // Escape로 모달 닫기.
  useEffect(() => {
    if (!deleteId) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setDeleteId(null);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [deleteId]);

  // 저장폼 열리면 포커스.
  useEffect(() => {
    if (profileName !== null) profileInputRef.current?.focus();
  }, [profileName]);

  // 탭 동기화: 다른 탭의 프로필 저장/삭제를 목록에 반영.
  useEffect(() => onStorageSync(hydrateProfiles), [hydrateProfiles]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>
          적용된 맥락
          <span className={styles.countBadge}>{activeCount}</span>
        </div>
        <div className={styles.subtitle}>생성 전·후 언제든 수정·삭제할 수 있어요.</div>
      </div>

      <div className={styles.list}>
        {contexts.length === 0 ? (
          <p className={styles.empty} role="status">
            질문에 답하면 여기에
            <br />맥락이 쌓여요.
          </p>
        ) : (
          contexts.map((c) => <ContextCard key={c.id} item={c} onAskDelete={setDeleteId} />)
        )}
      </div>

      <div className={styles.footer}>
        {/* My Context — 재사용 맥락 프로필 */}
        <div className={styles.profiles}>
          <div className={styles.profilesHead}>
            <span className={styles.profilesTitle}>내 맥락 프로필</span>
            {profileName === null ? (
              <button
                type="button"
                className={styles.profileSaveBtn}
                onClick={() => setProfileName("")}
                disabled={activeCount === 0}
                title={activeCount === 0 ? "저장할 맥락이 없어요" : "현재 맥락을 프로필로 저장"}
              >
                현재 맥락 저장
              </button>
            ) : null}
          </div>

          {profileName !== null && (
            <div className={styles.addRow}>
              <input
                ref={profileInputRef}
                className={styles.addInput}
                placeholder="프로필 이름…"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                onKeyDown={onProfileKey}
                aria-label="프로필 이름"
              />
              <button type="button" className={styles.addBtn} onClick={commitSaveProfile} aria-label="프로필 저장">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 6" />
                </svg>
              </button>
            </div>
          )}

          {profiles.length > 0 && (
            <ul className={styles.profileList}>
              {profiles.map((p) => (
                <li key={p.id} className={styles.profileChip}>
                  <button
                    type="button"
                    className={styles.profileLoad}
                    onClick={() => loadProfileById(p.id)}
                    title="이 프로필의 맥락을 현재 대화에 추가"
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    className={styles.profileDelete}
                    onClick={() => removeProfile(p.id)}
                    aria-label={`"${p.name}" 프로필 삭제`}
                    title="삭제"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.addRow}>
          <input
            className={styles.addInput}
            placeholder="맥락 직접 추가…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            aria-label="맥락 직접 추가"
          />
          <button type="button" className={styles.addBtn} onClick={handleAdd} aria-label="맥락 추가">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className={styles.regenBtn}
          onClick={requestRegen}
          disabled={!canRegen}
          aria-disabled={!canRegen}
          title={canRegen ? "변경된 맥락으로 다시 생성" : "변경사항이 없어요"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
          </svg>
          변경사항으로 다시 생성
        </button>
      </div>

      {/* 맥락 삭제 확인 모달 */}
      {ctxToDelete && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="맥락 삭제 확인"
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
            <div className={styles.modalTitle}>이 맥락을 삭제할까요?</div>
            <div className={styles.modalCategory}>{ctxToDelete.label || ctxToDelete.category}</div>
            <div className={styles.modalValue}>&ldquo;{ctxToDelete.value}&rdquo;</div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setDeleteId(null)}>취소</button>
              <button type="button" className={styles.deleteBtn} onClick={confirmDelete}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
