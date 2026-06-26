"use client";
// 앱 전역 설정 store (V9). theme/lang/noticeDismissed.
// SSR 하이드레이션 불일치 방지: 초기 state = 기본값 고정, storage 접근은 hydrateSettings()에서만.
import { create } from "zustand";
import { loadSettings, saveSettings } from "@/lib/storage";
import type { QualityMode, Settings, Theme } from "@/types";

const NOTICE_DISMISSED_KEY = "transintent:noticeDismissed";

export type SettingsState = {
  theme: Theme;
  lang: "ko" | "en";
  defaultTarget?: string; // 마지막으로 연 AI 챗 어댑터 id(다음에 강조)
  quality: QualityMode; // 생성 품질 모드(fast 기본 / max 정제 루프)
  noticeDismissed: boolean;
  hydrated: boolean;
  // actions
  hydrateSettings: () => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setLang: (l: "ko" | "en") => void;
  setDefaultTarget: (id: string) => void;
  clearDefaultTarget: () => void;
  setQuality: (q: QualityMode) => void;
  dismissNotice: () => void;
  restoreNotice: () => void;
};

/** storage에서 noticeDismissed 플래그를 읽는 헬퍼 (SSR safe). */
function readNoticeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(NOTICE_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** storage에 noticeDismissed 플래그를 쓰는 헬퍼. */
function writeNoticeDismissed(val: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTICE_DISMISSED_KEY, String(val));
  } catch {
    /* 용량 초과 등 — 무음 처리 */
  }
}

export const useSettings = create<SettingsState>((set, get) => {
  // 현재 state에서 영속 대상(Settings)을 구성 — 모든 저장 경로가 defaultTarget을 보존하도록.
  const persist = () => {
    const { theme, lang, defaultTarget, quality } = get();
    saveSettings({ theme, lang, defaultTarget, quality });
  };
  return {
  // 기본값은 loadSettings() 기본(theme "dark", lang "ko", quality "fast")·layout.tsx data-theme="dark"와 일치
  theme: "dark",
  lang: "ko",
  defaultTarget: undefined,
  quality: "fast",
  noticeDismissed: false,
  hydrated: false,

  /** effect에서 1회 호출 — localStorage에서 저장값을 읽어 store에 반영. */
  hydrateSettings: () => {
    const stored: Settings = loadSettings();
    const noticeDismissed = readNoticeDismissed();
    set({
      theme: stored.theme,
      lang: stored.lang,
      defaultTarget: stored.defaultTarget,
      quality: stored.quality,
      noticeDismissed,
      hydrated: true,
    });
  },

  setTheme: (theme) => {
    set({ theme });
    persist();
  },

  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    set({ theme });
    persist();
  },

  setLang: (lang) => {
    set({ lang });
    persist();
  },

  setDefaultTarget: (defaultTarget) => {
    if (get().defaultTarget === defaultTarget) return; // 동일 → 저장 생략
    set({ defaultTarget });
    persist();
  },

  /** 기본 타깃을 비움 — "자동(최근 사용)"로 되돌리기. */
  clearDefaultTarget: () => {
    if (get().defaultTarget === undefined) return; // 이미 비어 있음 → 생략
    set({ defaultTarget: undefined });
    persist();
  },

  setQuality: (quality) => {
    if (get().quality === quality) return; // 동일 → 저장 생략
    set({ quality });
    persist();
  },

  dismissNotice: () => {
    set({ noticeDismissed: true });
    writeNoticeDismissed(true);
  },

  /** dismissNotice의 역동작 — 안전 고지 배너 다시 표시. */
  restoreNotice: () => {
    set({ noticeDismissed: false });
    writeNoticeDismissed(false);
  },
  };
});
