"use client";
// NoticeBanner — 법적 고지 배너 (ARCH §14, 인벤토리 공통).
// hydrated && !noticeDismissed일 때만 렌더해 SSR 불일치 방지.
// 닫기 → dismissNotice() → localStorage 영속.
import { useSettings } from "@/lib/settings-store";
import styles from "./NoticeBanner.module.css";

export function NoticeBanner() {
  const hydrated = useSettings((s) => s.hydrated);
  const noticeDismissed = useSettings((s) => s.noticeDismissed);
  const dismissNotice = useSettings((s) => s.dismissNotice);

  // SSR/초기 렌더에서는 미노출(서버/클라 마크업 일치)
  if (!hydrated || noticeDismissed) return null;

  return (
    <div className={styles.banner} role="region" aria-label="고지">
      <p className={styles.text}>
        생성 결과는 AI가 만든 것으로 부정확할 수 있으며, 외부 AI 챗으로 열 때 입력 내용이 해당 서비스로 전송됩니다. 민감정보 입력에 주의하세요.
      </p>
      <button
        type="button"
        className={styles.close}
        aria-label="고지 닫기"
        onClick={dismissNotice}
      >
        ×
      </button>
    </div>
  );
}
