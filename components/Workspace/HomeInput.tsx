"use client";
// HomeInput — S1 입력 화면 (FR-1), 0003_dark 리스킨.
// 히어로 + 프리셋 + 글래스 입력 카드 + 추천 카드. 제출 시 /api/questions 호출 → 질문 단계.
import { useEffect, useState, type KeyboardEvent } from "react";
import type { Preset } from "@/types";
import { useSession } from "@/lib/store";
import { useSettings } from "@/lib/settings-store";
import { BrandMark } from "@/components/common/BrandMark";
import styles from "./HomeInput.module.css";

const PRESETS: { value: Preset; label: string; emoji: string }[] = [
  { value: "writing", label: "글쓰기", emoji: "✎" },
  { value: "coding", label: "코딩", emoji: "⌘" },
  { value: "image", label: "이미지 생성", emoji: "◇" },
  { value: "research", label: "분석·리서치", emoji: "▦" },
  { value: "planning", label: "기획", emoji: "◈" },
];

const REC_CARDS: { text: string; emoji: string; tint: string; prompt: string; preset: Preset }[] = [
  { text: "개인 브랜딩 페이지 문구 만들기", emoji: "🪪", tint: "rgba(90,120,255,.16)", prompt: "개인 브랜딩 웹페이지 문구 만들기", preset: "writing" },
  { text: "웹사이트 데이터 기반 리포트 작성", emoji: "📈", tint: "rgba(255,90,140,.16)", prompt: "내 웹사이트 데이터로 리포트 작성", preset: "research" },
  { text: "타깃에 맞는 매력적인 콘텐츠 작성", emoji: "✨", tint: "rgba(255,170,60,.16)", prompt: "타깃 독자에 맞춘 매력적인 콘텐츠 작성", preset: "writing" },
];

const MIN_LEN = 5;

export function HomeInput() {
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<Preset | undefined>(undefined);
  const [warn, setWarn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const start = useSession((s) => s.start);
  const setQuestions = useSession((s) => s.setQuestions);
  const setLoadingQuestions = useSession((s) => s.setLoadingQuestions);
  const setStage = useSession((s) => s.setStage);
  const lang = useSettings((s) => s.lang);

  // ExploreView에서 넘어온 시드 프롬프트/프리셋을 1회 적용.
  // 마이크로태스크 뒤로 미뤄 effect body 내 동기 setState 경고 회피(Sidebar와 동일 패턴).
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("ti:seed");
      if (raw) sessionStorage.removeItem("ti:seed");
    } catch {
      raw = null;
    }
    if (!raw) return;
    const data = raw;
    Promise.resolve().then(() => {
      try {
        const seed = JSON.parse(data) as { prompt?: string; preset?: Preset };
        if (seed.prompt) setPrompt(seed.prompt);
        if (seed.preset) setPreset(seed.preset);
      } catch {
        /* noop */
      }
    });
  }, []);

  async function handleSubmit() {
    const value = prompt.trim();
    if (value.length < MIN_LEN) {
      setWarn("조금 더 구체적으로 입력해 주세요. (예시 카드를 눌러도 돼요)");
      return;
    }
    setWarn("");
    setIsSubmitting(true);
    start(value, preset); // stage → questions (로딩 표시)
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value, preset, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setQuestions(await res.json());
    } catch {
      setLoadingQuestions(false);
      setStage("input"); // 실패 시 입력 단계 복귀(원본 보존)
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // IME 조합 중 Enter는 제출하지 않음(한글 끝글자 중복 방지).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function pickCard(p: string, ps: Preset) {
    setPrompt(p);
    setPreset(ps);
    setWarn("");
  }

  return (
    <div className={styles.scroll}>
      <div className={`${styles.root} ti-rise`}>
        <BrandMark size={62} />

        <p className={styles.greeting}>거친 한 줄이면 충분해요 👋</p>
        <h1 className={styles.title}>어떤 결과물이 필요하세요?</h1>
        <p className={styles.sub}>
          의도와 맥락을 몇 개의 객관식 질문으로 끌어내, 잘 구조화된 메타 프롬프트로 만들어 드려요.
        </p>

        {/* 프리셋 */}
        <div className={styles.presets} role="radiogroup" aria-label="용도 선택">
          {PRESETS.map((p) => {
            const on = preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={on}
                className={styles.preset}
                data-on={on ? "true" : "false"}
                onClick={() => setPreset(on ? undefined : p.value)}
              >
                <span className={styles.presetEmoji} aria-hidden="true">{p.emoji}</span>
                {p.label}
              </button>
            );
          })}
        </div>

        {/* 입력 카드 */}
        <div className={styles.inputCard}>
          <textarea
            className={styles.textarea}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (warn) setWarn("");
            }}
            onKeyDown={handleKey}
            placeholder="예: 제주도 가족여행 일정 짜줘"
            rows={1}
            aria-label="요청 입력"
          />
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={isSubmitting}
            aria-label="메타 프롬프트 생성"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
            </svg>
            <span>생성</span>
          </button>
        </div>
        {warn && (
          <div className={styles.warn} role="alert">
            ⚠ {warn}
          </div>
        )}

        {/* 추천 카드 */}
        <div className={styles.recCards}>
          {REC_CARDS.map((c) => (
            <button key={c.text} type="button" className={styles.recCard} onClick={() => pickCard(c.prompt, c.preset)}>
              <span className={styles.recEmoji} style={{ background: c.tint }}>{c.emoji}</span>
              <span className={styles.recText}>{c.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
