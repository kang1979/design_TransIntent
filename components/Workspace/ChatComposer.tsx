"use client";
// ChatComposer (FR-5) — 0003_dark 패널 푸터 컴포저. 대화 보강 입력.
// Enter 전송(Shift+Enter 줄바꿈). 토큰 상한 6000. 전송 시 'chat' 맥락 추가(맥락 바 반영) 후 재생성 신호.
import { useRef, type KeyboardEvent } from "react";
import { useSession } from "@/lib/store";
import styles from "./ChatComposer.module.css";

const TOKEN_CAP = 6000;

/** 맥락+메시지 전체 길이로 토큰 추정(3자 ≈ 1토큰). */
function approxTokens(
  contexts: { value: string; enabled: boolean }[],
  messages: { content: string }[],
): number {
  const ctxLen = contexts.reduce((s, c) => s + (c.enabled ? c.value.length : 0), 0);
  const msgLen = messages.reduce((s, m) => s + m.content.length, 0);
  return Math.ceil((ctxLen + msgLen) / 3);
}

export function ChatComposer({ disabled }: { disabled: boolean }) {
  const contexts = useSession((s) => s.contexts);
  const messages = useSession((s) => s.messages);
  const addChatContext = useSession((s) => s.addChatContext);
  const requestRegen = useSession((s) => s.requestRegen);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tokens = approxTokens(contexts, messages);
  const overCap = tokens >= TOKEN_CAP;
  const canSend = !disabled && !overCap;

  function handleSend() {
    const content = textareaRef.current?.value.trim() ?? "";
    if (!content || !canSend) return;
    if (tokens + Math.ceil(content.length / 3) > TOKEN_CAP) return;
    addChatContext(content); // 'chat' 맥락으로 추가 → 맥락 바에 즉시 노출 + 생성 반영
    if (textareaRef.current) textareaRef.current.value = "";
    requestRegen(); // ResultView가 regenSignal 변화를 구독해 재스트림
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // IME 조합 중 Enter(한글 마지막 글자 확정)는 제출하지 않음 — 끝글자 중복 입력 방지.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.root} role="region" aria-label="대화 보강">
      {overCap && (
        <p className={styles.capWarning} role="alert">
          대화가 길어 더 보강할 수 없어요(상한 도달)
        </p>
      )}
      <div className={styles.bar}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="대화로 맥락 더하기 — 예: 더 전문적으로, 표로 정리해줘"
          disabled={!canSend}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="보강 메시지 입력"
          aria-disabled={!canSend}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!canSend}
          aria-label="메시지 전송"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
