"use client";
// 3패널 floating 글래스 레이아웃 (0003_dark 정본). ARCH §2.
// 컨테이너(fixed) > mesh 배경 레이어 + flex 행[사이드바 · 메인 섹션 · 맥락 패널].
// 메인 섹션은 top-bar 헤더(사이드바 토글·단계 타이틀·배지) + NoticeBanner + 스테이지 콘텐츠(children).
import { useState, type ReactNode } from "react";
import { useSession } from "@/lib/store";
import { NoticeBanner } from "@/components/common/NoticeBanner";
import styles from "./AppShell.module.css";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  contextPanel?: ReactNode;
};

const TITLE: Record<string, string> = {
  input: "새 대화",
  questions: "의도 파악",
  result: "메타 프롬프트",
  explore: "프롬프트 라이브러리",
};

export function AppShell({ sidebar, children, contextPanel }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const stage = useSession((s) => s.stage);
  const originalPrompt = useSession((s) => s.originalPrompt);

  const headerTitle =
    stage === "result" && originalPrompt ? originalPrompt.slice(0, 40) : TITLE[stage] ?? "TransIntent";
  const stageBadge = stage === "questions" ? "2 · 질문" : stage === "result" ? "3 · 결과" : "";

  return (
    <div className={styles.shell}>
      {/* 애니메이션 mesh 배경 — pointer 무시, reduced-motion에서 정지(theme.css) */}
      <div className={styles.mesh} aria-hidden="true">
        <span className={styles.meshA} />
        <span className={styles.meshB} />
        <span className={styles.meshC} />
      </div>

      <div className={styles.row}>
        {sidebarOpen && (
          <aside className={styles.sidebar} aria-label="히스토리 및 내비게이션">
            {sidebar}
          </aside>
        )}

        <main className={styles.main}>
          <section className={styles.panel}>
            <header className={styles.topbar}>
              <div className={styles.topbarLeft}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setSidebarOpen((v) => !v)}
                  aria-label="사이드바 열기/닫기"
                  aria-pressed={sidebarOpen}
                  title="사이드바 열기/닫기"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="4" width="18" height="16" rx="2.5" />
                    <path d="M9 4v16" />
                  </svg>
                </button>
                <span className={styles.title}>{headerTitle}</span>
                {stageBadge && <span className={styles.badge}>{stageBadge}</span>}
              </div>
              <div className={styles.statusPill}>
                <span className={styles.statusDot} aria-hidden="true" />
                TransIntent
              </div>
            </header>

            <div className={styles.notice}>
              <NoticeBanner />
            </div>

            {children}
          </section>

          {contextPanel && (
            <aside className={styles.context} aria-label="적용된 맥락">
              {contextPanel}
            </aside>
          )}
        </main>
      </div>
    </div>
  );
}
