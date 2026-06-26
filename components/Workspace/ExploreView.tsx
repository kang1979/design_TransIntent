"use client";
// ExploreView — 0003_dark 신규 화면. 프롬프트 라이브러리 6카드.
// 카드 클릭 → store에 프롬프트/프리셋 시드 후 홈(입력) 단계로 전환(사용자가 검토·생성).
import type { Preset } from "@/types";
import { useSession } from "@/lib/store";
import styles from "./ExploreView.module.css";

const CARDS: { title: string; desc: string; emoji: string; tint: string; prompt: string; preset: Preset }[] = [
  { title: "블로그 글쓰기", desc: "SEO를 고려한 블로그 포스트 초안을 구조적으로.", emoji: "📝", tint: "rgba(90,120,255,.16)", prompt: "SEO 최적화 블로그 글 작성", preset: "writing" },
  { title: "코드 리뷰어", desc: "버그·개선점을 짚어주는 코드 리뷰 프롬프트.", emoji: "🧑‍💻", tint: "rgba(150,90,255,.16)", prompt: "내 코드 리뷰하고 개선점 제안", preset: "coding" },
  { title: "이미지 프롬프트", desc: "미드저니·DALL·E용 상세 이미지 묘사.", emoji: "🎨", tint: "rgba(255,120,80,.16)", prompt: "이미지 생성 모델용 상세 프롬프트", preset: "image" },
  { title: "데이터 분석", desc: "데이터셋에서 인사이트를 끌어내는 분석.", emoji: "📊", tint: "rgba(60,200,140,.16)", prompt: "데이터셋 분석하고 인사이트 도출", preset: "research" },
  { title: "제품 기획서", desc: "PRD·기능 정의를 빠짐없이 정리.", emoji: "🧭", tint: "rgba(255,90,140,.16)", prompt: "신규 기능 PRD 작성", preset: "planning" },
  { title: "이메일 작성", desc: "상황에 맞는 정중한 비즈니스 이메일.", emoji: "✉️", tint: "rgba(90,170,255,.16)", prompt: "정중한 비즈니스 이메일 작성", preset: "writing" },
];

export function ExploreView() {
  const setStage = useSession((s) => s.setStage);

  function pick(prompt: string, preset: Preset) {
    // 입력 단계로 전환 + 시드 프롬프트를 sessionStorage로 전달(HomeInput이 마운트 시 읽음).
    try {
      sessionStorage.setItem("ti:seed", JSON.stringify({ prompt, preset }));
    } catch {
      /* noop */
    }
    setStage("input");
  }

  return (
    <div className={styles.scroll}>
      <div className={`${styles.root} ti-rise`}>
        <h1 className={styles.title}>프롬프트 라이브러리</h1>
        <p className={styles.sub}>자주 쓰는 요청을 골라 바로 시작하세요.</p>
        <div className={styles.grid}>
          {CARDS.map((c) => (
            <button key={c.title} type="button" className={styles.card} onClick={() => pick(c.prompt, c.preset)}>
              <span className={styles.emoji} style={{ background: c.tint }}>{c.emoji}</span>
              <span className={styles.cardTitle}>{c.title}</span>
              <span className={styles.cardDesc}>{c.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
