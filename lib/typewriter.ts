"use client";
// 스트리밍 표시 부드럽게 — 네트워크 "도착"과 화면 "렌더"를 분리.
// push는 target(전체 누적)만 갱신하고, 단일 연속 rAF 루프가 "시간 기반 등속"으로 보이는 길이를 전진시킨다.
// 네트워크 버스트와 무관하게 일정 속도로 타이핑하고, 너무 뒤처질 때만 지연상한 내에서 매끄럽게 가속.
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 한 프레임(경과 elapsedMs)에 드러낼 글자 수(순수·테스트용).
 * 등속(baseCps) — 단, 밀린 양(backlog)이 baseCps*maxLagSec를 넘으면 비율로 가속해
 * 표시 지연을 maxLagSec 이내로 묶는다(스트림 끝물·대량 버스트 대비). 경과가 짧으면 0도 가능(시간 누적).
 */
export function revealStep(
  shown: number,
  targetLen: number,
  elapsedMs: number,
  baseCps = 120,
  maxLagSec = 0.5,
): number {
  if (shown >= targetLen) return 0;
  const backlog = targetLen - shown;
  let cps = baseCps;
  if (backlog > baseCps * maxLagSec) cps = backlog / maxLagSec; // 너무 뒤처지면 가속(지연 상한 유지)
  const step = Math.floor((elapsedMs / 1000) * cps);
  return Math.min(backlog, Math.max(0, step));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export type Typewriter = {
  displayed: string; // 현재 화면에 보이는(드러난) 텍스트
  isTyping: boolean; // 아직 target을 다 못 따라잡음
  push: (full: string) => void; // 델타: target 갱신 + 애니메이션 가동
  seed: (full: string) => void; // 즉시 전체 표시(복원/버전선택/편집/reduced-motion)
  reset: () => void; // 비우기(재생성 시작)
};

/**
 * 타이프라이터 버퍼.
 * @param onTick 매 프레임 표시 갱신 후 호출(스크롤 추종 등). rAF 안에서 실행돼 강제 리플로우 빈도를 낮춘다.
 */
export function useTypewriter(onTick?: () => void): Typewriter {
  const [displayed, setDisplayed] = useState("");
  const [typing, setTyping] = useState(false);
  const targetRef = useRef(""); // 도달 목표(누적 전체)
  const shownRef = useRef(0); // 드러난 길이
  const rafRef = useRef(0); // 가동 중 rAF id(0이면 정지)
  const lastTsRef = useRef(0); // 직전 프레임 타임스탬프(0이면 다음 프레임에 초기화)
  const onTickRef = useRef(onTick);

  // 최신 onTick 보관(ref 쓰기는 effect 안에서만).
  useEffect(() => {
    onTickRef.current = onTick;
  });

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  // 단일 연속 rAF: 매 프레임 경과 시간만큼 등속 전진. step==0이면 lastTs를 유지해 시간을 누적(진행 보장).
  // 루프는 ref에 담아 자기참조(rAF 재귀)를 안전하게 한다.
  const loopRef = useRef<(ts: number) => void>(() => {});
  useEffect(() => {
    loopRef.current = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const elapsed = ts - lastTsRef.current;
      const step = revealStep(shownRef.current, targetRef.current.length, elapsed);
      if (step > 0) {
        shownRef.current += step;
        lastTsRef.current = ts;
        setDisplayed(targetRef.current.slice(0, shownRef.current));
        onTickRef.current?.();
      }
      if (shownRef.current < targetRef.current.length) {
        rafRef.current = requestAnimationFrame(loopRef.current);
      } else {
        rafRef.current = 0; // 다 따라잡음 — 다음 push에서 재시동
        setTyping(false);
      }
    };
  });

  // 델타: target만 키우고 루프가 멈춰 있으면 시동. reduced-motion이면 즉시 전체 노출.
  const push = useCallback(
    (full: string) => {
      targetRef.current = full;
      if (prefersReducedMotion()) {
        stop();
        shownRef.current = full.length;
        setDisplayed(full);
        setTyping(false);
        return;
      }
      if (shownRef.current < full.length) {
        setTyping(true);
        if (!rafRef.current) {
          lastTsRef.current = 0;
          rafRef.current = requestAnimationFrame(loopRef.current);
        }
      }
    },
    [stop],
  );

  // 즉시 전체 표시(애니메이션 없음).
  const seed = useCallback(
    (full: string) => {
      stop();
      targetRef.current = full;
      shownRef.current = full.length;
      setDisplayed(full);
      setTyping(false);
    },
    [stop],
  );

  const reset = useCallback(() => {
    stop();
    targetRef.current = "";
    shownRef.current = 0;
    setDisplayed("");
    setTyping(false);
  }, [stop]);

  // 언마운트 시 rAF 정리.
  useEffect(() => stop, [stop]);

  return { displayed, isTyping: typing, push, seed, reset };
}
