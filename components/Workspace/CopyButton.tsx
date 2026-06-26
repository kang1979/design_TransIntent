"use client";
// 클립보드 복사 버튼. clipboard API 실패(권한/비보안 컨텍스트) 시 폴백 안내.
import { useState } from "react";
import styles from "./CopyButton.module.css";

type CopyState = "idle" | "copied" | "failed";

export function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed"); // 권한 거부/비보안 컨텍스트 → 수동 복사 안내
    }
    setTimeout(() => setState("idle"), 1800);
  }

  const label =
    state === "copied" ? "복사됨 ✓" : state === "failed" ? "복사 실패 — 직접 선택" : "복사";

  return (
    <button
      type="button"
      className={styles.button}
      onClick={copy}
      disabled={disabled}
      data-state={state}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
