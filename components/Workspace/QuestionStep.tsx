"use client";
// S2 질문 단계 (FR-2·2a) — 0003_dark 리스킨. 하나씩(step)/한 번에(all) 두 모드.
// 진행바 + 모드 토글 + 객관식/직접입력 + 건너뛰기 + 이전/다음 + 질문 더 받기 + 생성 전환.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Question } from "@/types";
import { useSession } from "@/lib/store";
import { useSettings } from "@/lib/settings-store";
import { categoryOf } from "@/lib/contexts";
import styles from "./QuestionStep.module.css";

const answeredArr = (q: Question): string[] =>
  Array.isArray(q.answer) ? q.answer : typeof q.answer === "string" && q.answer ? [q.answer] : [];

const isAnswered = (q: Question) => !q.skipped && answeredArr(q).length > 0;

export function QuestionStep() {
  const questions = useSession((s) => s.questions);
  const loading = useSession((s) => s.loadingQuestions);
  const originalPrompt = useSession((s) => s.originalPrompt);
  const preset = useSession((s) => s.preset);
  const qStyle = useSession((s) => s.qStyle);
  const qIndex = useSession((s) => s.qIndex);
  const answer = useSession((s) => s.answer);
  const toggleSkip = useSession((s) => s.toggleSkip);
  const appendQuestions = useSession((s) => s.appendQuestions);
  const setQStyle = useSession((s) => s.setQStyle);
  const setQIndex = useSession((s) => s.setQIndex);
  const setStage = useSession((s) => s.setStage);
  const seedContexts = useSession((s) => s.seedContexts);
  const focusQuestionId = useSession((s) => s.focusQuestionId);
  const clearFocusQuestion = useSession((s) => s.clearFocusQuestion);

  const lang = useSettings((s) => s.lang);
  const [loadingMore, setLoadingMore] = useState(false);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 맥락 '수정' → 질문 이동 신호 처리: 해당 질문으로 스크롤(ALL) / 상단 정렬(STEP) 후 신호 해제.
  // rAF로 미뤄 레이아웃 완료 후 스크롤하고, effect 본문 동기 setState(연쇄 렌더)도 피한다.
  useEffect(() => {
    if (!focusQuestionId) return;
    const id = focusQuestionId;
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      if (qStyle === "all") {
        itemRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(id);
        highlightTimer = setTimeout(() => setHighlightId(null), 1200);
      } else {
        scrollRef.current?.scrollTo({ top: 0 });
      }
      clearFocusQuestion();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, [focusQuestionId, qStyle, clearFocusQuestion]);

  const total = questions.length || 1;
  const curIdx = Math.min(qIndex, questions.length - 1);
  const curQ = questions[curIdx];
  const lastQ = curIdx >= questions.length - 1;
  const answeredCount = questions.filter(isAnswered).length;
  const progressPct = questions.length
    ? Math.round(((curIdx + (curQ && isAnswered(curQ) ? 1 : 0)) / questions.length) * 100)
    : 0;

  function generate() {
    const { contextsDirty, metaPrompt, setMetaPrompt } = useSession.getState();
    seedContexts();
    // 이미 결과가 있는데 답변/맥락이 바뀌었으면(재답변 등) 이전 메타프롬프트를 비워
    // 결과 화면 재마운트 시 재생성되도록 한다(→ 새 버전 칩 누적). 변경 없으면 기존 결과 유지.
    if (contextsDirty && metaPrompt) setMetaPrompt("");
    setStage("result");
  }

  function advance() {
    if (curIdx < questions.length - 1) setQIndex(curIdx + 1);
    else generate();
  }

  /** 옵션 선택. single=치환(+step이면 자동 진행), multi=토글. */
  function pickOption(q: Question, label: string) {
    if (q.type === "multi") {
      const cur = answeredArr(q);
      answer(q.id, cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]);
    } else {
      answer(q.id, label);
      if (qStyle === "step") setTimeout(advance, 180);
    }
  }

  function addCustom(q: Question) {
    const raw = (customInputs[q.id] ?? "").trim();
    if (!raw) return;
    if (q.type === "multi") {
      const cur = answeredArr(q);
      if (!cur.includes(raw)) answer(q.id, [...cur, raw]);
    } else {
      answer(q.id, raw);
    }
    setCustomInputs((m) => ({ ...m, [q.id]: "" }));
    if (q.type !== "multi" && qStyle === "step") setTimeout(advance, 180);
  }

  function skip() {
    if (curQ) toggleSkip(curQ.id);
    advance();
  }

  async function moreQuestions() {
    setLoadingMore(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: originalPrompt, preset, exclude: questions.map((q) => q.id), lang }),
      });
      if (res.ok) appendQuestions(await res.json());
    } finally {
      setLoadingMore(false);
    }
  }

  function customKey(e: KeyboardEvent<HTMLInputElement>, q: Question) {
    // IME 조합 중 Enter는 추가하지 않음(한글 끝글자 중복 방지).
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addCustom(q);
    }
  }

  /** 옵션 목록 = 정의된 옵션 ++ 직접입력으로 추가돼 선택된 값. */
  function optionsFor(q: Question): string[] {
    const sel = answeredArr(q);
    const base = q.options ?? [];
    return [...base, ...sel.filter((v) => !base.includes(v))];
  }

  if (loading) {
    // 곧 나타날 STEP 질문 화면 구조(진행바·카테고리·질문·선택지 4개)를 흉내낸 스켈레톤.
    // 스켈레톤 블록은 aria-hidden, 상태 안내만 role="status"로 스크린리더에 전달.
    return (
      <div className={styles.scroll}>
        <div className={`${styles.root} ti-rise`}>
          {/* 상태 스트립 = 실제 progressHead 자리. 안내 문구를 폼 안으로 통합(떠 있지 않게). */}
          <div className={styles.skHead}>
            <span className={styles.skStatusInline} role="status">
              <span className={styles.skDot} aria-hidden="true" />
              의도를 끌어낼 질문을 만드는 중…
            </span>
            <span className={`${styles.sk} ${styles.skSeg}`} aria-hidden="true" />
          </div>
          <div className={styles.bar} aria-hidden="true">
            <div className={styles.barIndet} />
          </div>
          <div aria-hidden="true">
            <span className={`${styles.sk} ${styles.skCat}`} />
            <span className={`${styles.sk} ${styles.skQ1}`} />
            <span className={`${styles.sk} ${styles.skQ2}`} />
            <span className={`${styles.sk} ${styles.skHint}`} />
            <div className={styles.skOptions}>
              <span className={`${styles.sk} ${styles.skOpt}`} />
              <span className={`${styles.sk} ${styles.skOpt}`} />
              <span className={`${styles.sk} ${styles.skOpt}`} />
              <span className={`${styles.sk} ${styles.skOpt}`} />
            </div>
            <div className={styles.skNav}>
              <span className={`${styles.sk} ${styles.skBtn}`} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scroll} ref={scrollRef}>
      <div className={`${styles.root} ti-rise`}>
        {/* 진행 + 모드 토글 */}
        <div className={styles.progressHead}>
          <span className={styles.progressLabel}>질문 {Math.min(curIdx + 1, total)} / {total}</span>
          <div className={styles.seg} role="group" aria-label="질문 진행 방식">
            <button type="button" className={styles.segBtn} data-on={qStyle === "step"} onClick={() => setQStyle("step")}>하나씩</button>
            <button type="button" className={styles.segBtn} data-on={qStyle === "all"} onClick={() => setQStyle("all")}>한 번에</button>
          </div>
        </div>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${progressPct}%` }} />
        </div>

        {/* STEP 모드 */}
        {qStyle === "step" && curQ && (
          <div>
            <div className={styles.category}>{categoryOf(curQ.text)}</div>
            <h2 className={styles.question}>{curQ.text}</h2>
            <p className={styles.hint}>
              {curQ.type === "multi"
                ? "여러 개 선택할 수 있어요 · 직접 입력도 가능해요"
                : "하나를 선택하면 다음으로 넘어가요 · 직접 입력도 가능해요"}
            </p>
            <div className={styles.options}>
              {optionsFor(curQ).map((opt) => {
                const on = answeredArr(curQ).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    role={curQ.type === "multi" ? "checkbox" : "radio"}
                    aria-checked={on}
                    className={styles.option}
                    data-on={on ? "true" : "false"}
                    onClick={() => pickOption(curQ, opt)}
                  >
                    <span className={styles.mark} data-shape={curQ.type === "multi" ? "box" : "circle"} data-on={on ? "true" : "false"}>
                      {on ? (curQ.type === "multi" ? "✓" : "●") : ""}
                    </span>
                    <span className={styles.optLabel}>{opt}</span>
                  </button>
                );
              })}

              <div className={styles.customRow} data-has={(customInputs[curQ.id] ?? "").trim() ? "true" : "false"}>
                <span className={styles.customMark}>✎</span>
                <input
                  className={styles.customInput}
                  value={customInputs[curQ.id] ?? ""}
                  onChange={(e) => setCustomInputs((m) => ({ ...m, [curQ.id]: e.target.value }))}
                  onKeyDown={(e) => customKey(e, curQ)}
                  placeholder="직접 입력…"
                  aria-label="직접 입력"
                />
                {(customInputs[curQ.id] ?? "").trim() && (
                  <button type="button" className={styles.customAdd} onClick={() => addCustom(curQ)}>추가</button>
                )}
              </div>

              <button type="button" className={styles.skip} onClick={skip}>
                <span className={styles.skipMark}>⤳</span>
                <span>해당 없음 · 이 질문 건너뛰기</span>
              </button>
            </div>

            <div className={styles.navRow}>
              {curIdx > 0 && (
                <button type="button" className={styles.prevBtn} onClick={() => setQIndex(curIdx - 1)}>이전</button>
              )}
              <div className={styles.spacer} />
              <button type="button" className={styles.primaryBtn} onClick={advance}>
                {lastQ ? "메타 프롬프트 생성" : "다음"}
              </button>
            </div>
          </div>
        )}

        {/* ALL 모드 */}
        {qStyle === "all" && (
          <div>
            <div className={styles.allList}>
              {questions.map((q) => (
                <div
                  key={q.id}
                  ref={(el) => {
                    itemRefs.current[q.id] = el;
                  }}
                  className={highlightId === q.id ? styles.qHighlight : undefined}
                >
                  <div className={styles.categorySm}>{categoryOf(q.text)}</div>
                  <h3 className={styles.questionSm}>{q.text}</h3>
                  <div className={styles.chips}>
                    {optionsFor(q).map((opt) => {
                      const on = answeredArr(q).includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          role={q.type === "multi" ? "checkbox" : "radio"}
                          aria-checked={on}
                          className={styles.chip}
                          data-on={on ? "true" : "false"}
                          onClick={() => pickOption(q, opt)}
                        >
                          {opt}
                        </button>
                      );
                    })}
                    <input
                      className={styles.chipInput}
                      value={customInputs[q.id] ?? ""}
                      onChange={(e) => setCustomInputs((m) => ({ ...m, [q.id]: e.target.value }))}
                      onKeyDown={(e) => customKey(e, q)}
                      placeholder="+ 직접 입력"
                      aria-label={`${categoryOf(q.text)} 직접 입력`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.navRow}>
              <div className={styles.spacer} />
              <button type="button" className={styles.primaryBtn} onClick={generate}>메타 프롬프트 생성</button>
            </div>
          </div>
        )}

        {/* 질문 더 받기 */}
        <div className={styles.moreRow}>
          <button type="button" className={styles.moreBtn} onClick={moreQuestions} disabled={loadingMore}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {loadingMore ? "불러오는 중…" : "질문 더 받기"}
          </button>
          <span className={styles.moreHint}>건너뛴 질문은 기본값으로 처리돼요. (답변 {answeredCount} / {questions.length})</span>
        </div>
      </div>
    </div>
  );
}
