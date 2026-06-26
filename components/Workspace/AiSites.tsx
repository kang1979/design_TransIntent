"use client";
// AiSites (FR-7) — 0003_dark. "AI 챗으로 열기" 5개 사이트 버튼 행.
// 어떤 사이트도 URL 프리필이 안 되므로(2026 현실), 모두 동일하게 "복사 → 안내 카드 → 사용자가 직접 열기".
import { useState } from "react";
import { adapters, pickOpenUrl } from "@/lib/deeplink";
import type { ChatAdapter } from "@/lib/deeplink.types";
import { useSettings } from "@/lib/settings-store";
import { CopyButton } from "./CopyButton";
import styles from "./AiSites.module.css";

// 사이트별 모노 배지(글자/그라데이션). id 누락 시 라벨 첫 글자 폴백.
const BADGE: Record<string, { mono: string; color: string }> = {
  chatgpt: { mono: "GPT", color: "linear-gradient(135deg,#10a37f,#1a7f64)" },
  claude: { mono: "C", color: "linear-gradient(135deg,#d97757,#c2410c)" },
  gemini: { mono: "G", color: "linear-gradient(135deg,#4285f4,#9b72cb)" },
  grok: { mono: "X", color: "linear-gradient(135deg,#1a1a1a,#444)" },
  perplexity: { mono: "P", color: "linear-gradient(135deg,#20808d,#1a6470)" },
};

type Guide = { adapter: ChatAdapter; copied: boolean };

export function AiSites({ prompt, disabled }: { prompt: string; disabled?: boolean }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const setDefaultTarget = useSettings((s) => s.setDefaultTarget);

  async function pick(a: ChatAdapter) {
    setDefaultTarget(a.id); // 마지막 선택 기억 → 다음에 강조
    // 클릭에선 "복사만". 탭을 안 여니 await 후 팝업차단 걱정 없음.
    // 안내를 먼저 보여주고(하단 고정 카드), 열기는 사용자가 카드의 [열기] 버튼으로.
    let copied = false;
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      copied = false; // 자동 복사 거부 → 카드의 CopyButton(수동 재시도)으로 안내
    }
    setGuide({ adapter: a, copied });
  }

  function openSite(a: ChatAdapter) {
    // 카드의 [열기] = 새 사용자 제스처 → window.open 동기 호출(팝업차단 회피).
    // 프롬프트는 이미 복사/카드에 있으므로 팝업이 막혀도 안전(별도 모달 불필요).
    window.open(pickOpenUrl(a, prompt), "_blank", "noopener,noreferrer");
  }

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        AI 챗으로 열기
        <span className={styles.headHint}>버튼을 누르면 복사돼요 · 사이트를 열어 붙여넣기(Cmd/Ctrl+V)</span>
      </div>
      <div className={styles.sites}>
        {adapters.map((a) => {
          const b = BADGE[a.id] ?? { mono: a.label.slice(0, 1), color: "linear-gradient(135deg,#555,#333)" };
          return (
            <button
              key={a.id}
              type="button"
              className={styles.site}
              onClick={() => pick(a)}
              disabled={disabled}
            >
              <span className={styles.badge} style={{ background: b.color }}>{b.mono}</span>
              {a.label}
            </button>
          );
        })}
      </div>

      {guide && (
        <div className={styles.toast} role="status">
          <span className={styles.toastIcon}>{guide.copied ? "📋" : "⚠️"}</span>
          <div className={styles.toastBody}>
            <div className={styles.toastTitle}>
              {guide.copied ? "복사했어요" : "복사하지 못했어요"}
            </div>
            <div className={styles.toastText}>
              {guide.copied
                ? `${guide.adapter.label}을(를) 열고 입력창에 붙여넣기(Cmd/Ctrl+V) 하세요.`
                : "‘복사’를 눌러 다시 시도하거나, 결과 본문을 직접 선택해 복사하세요."}
            </div>
            <div className={styles.toastActions}>
              <CopyButton text={prompt} />
              <button type="button" className={styles.toastOpen} onClick={() => openSite(guide.adapter)}>
                {guide.adapter.label} 열기 ↗
              </button>
            </div>
          </div>
          <button type="button" className={styles.toastClose} onClick={() => setGuide(null)} aria-label="알림 닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
