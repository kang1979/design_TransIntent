"use client";
// SettingsModal — 테마·언어·부가설정(기본 AI 챗 타깃·안전 고지)을 한곳에서 관리.
// 표준 모달 패턴: overlay/role=dialog/aria-modal/ESC/배경클릭/초기 포커스+복귀.
import { useEffect, useId, useRef } from "react";
import { useSettings } from "@/lib/settings-store";
import { adapters } from "@/lib/deeplink";
import { ThemeToggle } from "./ThemeToggle";
import { LangToggle } from "./LangToggle";
import styles from "./SettingsModal.module.css";

type Props = {
  onClose: () => void;
};

export function SettingsModal({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const defaultTarget = useSettings((s) => s.defaultTarget);
  const setDefaultTarget = useSettings((s) => s.setDefaultTarget);
  const clearDefaultTarget = useSettings((s) => s.clearDefaultTarget);
  const quality = useSettings((s) => s.quality);
  const setQuality = useSettings((s) => s.setQuality);
  const noticeDismissed = useSettings((s) => s.noticeDismissed);
  const restoreNotice = useSettings((s) => s.restoreNotice);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus?.(); // 트리거(톱니 버튼)로 포커스 복귀
    };
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // 오버레이 클릭 닫기
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            설정
          </h2>
          <button ref={closeRef} type="button" className={styles.iconClose} aria-label="설정 닫기" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>테마</span>
          <ThemeToggle />
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>언어</span>
          <LangToggle />
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>기본 AI 챗</span>
          <div className={styles.chips} role="radiogroup" aria-label="기본 AI 챗 선택">
            <button
              type="button"
              role="radio"
              aria-checked={defaultTarget === undefined}
              className={styles.chip}
              data-active={defaultTarget === undefined ? "true" : "false"}
              onClick={clearDefaultTarget}
            >
              자동(최근 사용)
            </button>
            {adapters.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={defaultTarget === a.id}
                className={styles.chip}
                data-active={defaultTarget === a.id ? "true" : "false"}
                onClick={() => setDefaultTarget(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>생성 품질</span>
          <div className={styles.chips} role="radiogroup" aria-label="생성 품질 모드 선택">
            <button
              type="button"
              role="radio"
              aria-checked={quality === "fast"}
              className={styles.chip}
              data-active={quality === "fast" ? "true" : "false"}
              onClick={() => setQuality("fast")}
              title="의도를 반영해 한 번에 생성 — 빠름"
            >
              빠르게
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={quality === "max"}
              className={styles.chip}
              data-active={quality === "max" ? "true" : "false"}
              onClick={() => setQuality("max")}
              title="초안→자기검토→최종(정제 루프) — 더 높은 품질, 더 느림"
            >
              최고 품질
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>안전 고지</span>
          <div className={styles.noticeRow}>
            <span className={styles.noticeState}>{noticeDismissed ? "숨김" : "표시 중"}</span>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={restoreNotice}
              disabled={!noticeDismissed}
            >
              다시 보기
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
