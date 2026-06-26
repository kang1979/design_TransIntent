"use client";
// S3 결과 단계 (FR-6) — 0003_dark 리스킨. 스트리밍/취소/버전/편집 로직은 보존.
// 불변식: XSS 방지 — dangerouslySetInnerHTML 금지. 스트림은 <pre> 텍스트, 완료본은 구조 블록(H/bullet/P)으로 렌더.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/store";
import { useSettings } from "@/lib/settings-store";
import { generateStream, RateLimitError } from "@/lib/streamClient";
import type { QualityMode } from "@/types";
import { useTypewriter } from "@/lib/typewriter";
import { CopyButton } from "./CopyButton";
import { AiSites } from "./AiSites";
import { ChatComposer } from "./ChatComposer";
import styles from "./ResultView.module.css";

type Block = { kind: "h" | "bullet" | "p"; text: string };

/** 메타프롬프트 텍스트 → 구조 블록. 헤딩(#~###)·불릿(-*•)·문단. */
function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^#{1,3}\s/.test(t)) out.push({ kind: "h", text: t.replace(/^#{1,3}\s/, "") });
    else if (/^[-*•]\s/.test(t)) out.push({ kind: "bullet", text: t.replace(/^[-*•]\s/, "") });
    else out.push({ kind: "p", text: t });
  }
  return out;
}

export function ResultView() {
  const metaPrompt = useSession((s) => s.metaPrompt);
  const versions = useSession((s) => s.versions);
  const resultVersion = useSession((s) => s.resultVersion);
  const regenSignal = useSession((s) => s.regenSignal);
  const contexts = useSession((s) => s.contexts);
  const pushVersion = useSession((s) => s.pushVersion);
  const selectVersion = useSession((s) => s.selectVersion);
  const editCurrentVersion = useSession((s) => s.editCurrentVersion);
  const markGenerated = useSession((s) => s.markGenerated);

  const outputRef = useRef<HTMLPreElement | null>(null);
  // 표시 텍스트는 타이프라이터 버퍼가 관리(네트워크 버스트와 렌더 분리). 스크롤 추종은 rAF tick 안에서.
  const { displayed: text, isTyping, push, seed, reset } = useTypewriter(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });
  const [streaming, setStreaming] = useState(!metaPrompt);
  // 이번 생성에 쓰인 품질 모드(진행 표기용). 초기값은 설정값으로(마운트 시 effect 내 setState 회피).
  const [runMode, setRunMode] = useState<QualityMode>(() => useSettings.getState().quality);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState(metaPrompt);
  const abortRef = useRef<AbortController | null>(null);
  // 최초 마운트 후 regenSignal 변화만 재생성 트리거하기 위한 기준값.
  const lastSignalRef = useRef(regenSignal);

  function start(ctrl: AbortController) {
    const { contexts: ctx, messages } = useSession.getState();
    const { lang, quality } = useSettings.getState();
    generateStream({ contexts: ctx, messages, lang, mode: quality }, { signal: ctrl.signal, onDelta: push })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (res.error) setError(res.error);
        else if (!res.aborted) {
          push(res.text); // 최종 전체를 target으로 확정(마지막 델타 지연 대비) → 다 타이핑되면 블록 전환
          pushVersion(res.text); // 새 버전 누적(metaPrompt도 갱신)
          markGenerated();
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof RateLimitError ? err.message : String(err));
      })
      .finally(() => {
        if (abortRef.current === ctrl) {
          setStreaming(false);
          abortRef.current = null;
        }
      });
  }

  function run() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunMode(useSettings.getState().quality); // 진행 표기를 이번 재생성 모드로 갱신
    setError(null);
    setEditing(false);
    reset();
    setStreaming(true);
    start(ctrl);
  }

  // 최초 진입: 결과가 있으면(복원 대화) 애니메이션 없이 즉시 표시, 없으면 1회 생성.
  useEffect(() => {
    if (metaPrompt) {
      seed(metaPrompt);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    start(ctrl);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 재생성 신호 변화 → 재스트림(ContextPanel "다시 생성" / ChatComposer 전송).
  useEffect(() => {
    if (regenSignal === lastSignalRef.current) return;
    lastSignalRef.current = regenSignal;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenSignal]);

  function stop() {
    abortRef.current?.abort();
  }

  function pickVersion(v: number) {
    if (streaming || isTyping) return;
    const ver = versions.find((x) => x.v === v);
    if (!ver) return;
    selectVersion(v);
    seed(ver.metaPrompt);
    setEditing(false);
  }

  function toggleEdit() {
    if (editing) {
      editCurrentVersion(editBuffer);
      seed(editBuffer);
      setEditing(false);
    } else {
      setEditBuffer(text);
      setEditing(true);
    }
  }

  const activeCount = contexts.filter((c) => c.enabled).length;
  // 타이핑 중에는 <pre>{text}>로만 렌더 → 블록 파싱은 타이핑이 끝난 뒤에만.
  const typingOut = streaming || isTyping;
  const blocks = useMemo(() => (typingOut ? [] : parseBlocks(text)), [typingOut, text]);

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <div className={`${styles.body} ti-rise`}>
          {/* 헤더: 라벨/맥락수/버전칩 + 편집/복사 */}
          <div className={styles.head}>
            <div>
              <div className={styles.kicker}>생성된 메타 프롬프트</div>
              <div className={styles.metaRow}>
                <span className={styles.count}>{activeCount}개 맥락 반영</span>
                {versions.map((ver) => (
                  <button
                    key={ver.v}
                    type="button"
                    className={styles.chip}
                    data-on={ver.v === resultVersion ? "true" : "false"}
                    onClick={() => pickVersion(ver.v)}
                    title={`버전 ${ver.v}로 보기`}
                  >
                    v{ver.v}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.headActions}>
              <button
                type="button"
                className={styles.editBtn}
                onClick={toggleEdit}
                disabled={typingOut || !text}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                {editing ? "저장" : "직접 수정"}
              </button>
              <CopyButton text={editing ? editBuffer : text} disabled={typingOut || !text} />
            </div>
          </div>

          {/* 코드 윈도우 */}
          <div className={styles.window}>
            <div className={styles.windowBar}>
              <span className={styles.dot} style={{ background: "#ff5f57" }} />
              <span className={styles.dot} style={{ background: "#ffbd2e" }} />
              <span className={styles.dot} style={{ background: "#28c840" }} />
              <span className={styles.filename}>meta-prompt.md</span>
            </div>

            {error ? (
              <div className={styles.error} role="alert">
                <p>{error}</p>
                <button type="button" className={styles.retry} onClick={run}>다시 시도</button>
              </div>
            ) : editing ? (
              <textarea
                className={styles.editArea}
                value={editBuffer}
                onChange={(e) => setEditBuffer(e.target.value)}
                aria-label="메타 프롬프트 편집"
              />
            ) : streaming && text.length === 0 ? (
              // 첫 토큰 전: 메타프롬프트 형태(헤딩+문단+불릿)를 흉내낸 스켈레톤(질문 화면과 톤 통일).
              <div className={styles.skWrap} aria-hidden="true">
                <span className={`${styles.skLine} ${styles.skHeading}`} />
                <span className={`${styles.skLine} ${styles.skLong}`} />
                <span className={`${styles.skLine} ${styles.skShort}`} />
                <span className={`${styles.skLine} ${styles.skHeading}`} />
                <span className={`${styles.skLine} ${styles.skLong}`} />
                <span className={`${styles.skLine} ${styles.skBullet}`} />
                <span className={`${styles.skLine} ${styles.skBullet}`} />
                <span className={`${styles.skLine} ${styles.skBullet}`} />
              </div>
            ) : typingOut ? (
              <pre ref={outputRef} className={styles.stream}>
                {text}
                <span className={styles.cursor} aria-hidden="true" />
              </pre>
            ) : (
              <div className={styles.blocks}>
                {blocks.length === 0 ? (
                  <p className={styles.empty}>결과가 비어 있습니다.</p>
                ) : (
                  blocks.map((b, i) =>
                    b.kind === "h" ? (
                      <div key={i} className={styles.h}>
                        <span className={styles.hBar} />
                        <span className={styles.hText}>{b.text}</span>
                      </div>
                    ) : b.kind === "bullet" ? (
                      <div key={i} className={styles.bullet}>
                        <span className={styles.bulletDot}>•</span>
                        <span className={styles.bulletText}>{b.text}</span>
                      </div>
                    ) : (
                      <div key={i} className={styles.p}>{b.text}</div>
                    ),
                  )
                )}
              </div>
            )}
          </div>

          {streaming && (
            <div className={styles.streamActions}>
              <button type="button" className={styles.stopBtn} onClick={stop}>생성 중지</button>
              <span className={styles.streamHint} role="status">
                {/* 첫 토큰 전: fast는 인라인 의도분석으로 곧바로 생성, max는 초안→검토. 토큰 후: 구조화 */}
                {text.length === 0
                  ? runMode === "max"
                    ? "의도 분석 → 초안 작성 → 검토 중…"
                    : "메타 프롬프트를 만드는 중…"
                  : "메타 프롬프트를 구조화하는 중…"}
              </span>
            </div>
          )}

          {/* AI 챗으로 열기 */}
          {!typingOut && !error && text && <AiSites prompt={editing ? editBuffer : text} />}
        </div>
      </div>

      {/* 패널 푸터: 대화 보강 */}
      <ChatComposer disabled={typingOut} />
    </div>
  );
}
