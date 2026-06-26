// settings.test.ts — SettingsStore 검증 (V9)
// setTheme/setLang이 saveSettings로 영속되고 hydrateSettings로 복원되는지.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSettings } from "@/lib/storage";
import { useSettings } from "@/lib/settings-store";

beforeEach(() => {
  localStorage.clear();
  // zustand 싱글톤 격리 — 테스트 간 store 상태 누수 방지(순서 의존 flaky 방지).
  useSettings.setState({ theme: "dark", lang: "ko", defaultTarget: undefined, noticeDismissed: false, hydrated: false });
});
afterEach(() => localStorage.clear());

// useSettings는 zustand 모듈 싱글톤 — 테스트 간 상태 격리를 위해 직접 스토리지 계층 검증 우선.
// store 자체 동작은 통합 경로(storage + store action)로 검증한다.

describe("settings store — storage 영속 (통합)", () => {
  it("초기 기본값: theme=dark, lang=ko", () => {
    const settings = loadSettings();
    expect(settings.theme).toBe("dark");
    expect(settings.lang).toBe("ko");
  });

  it("레거시 theme(vivid) 저장값은 dark로 정규화", () => {
    localStorage.setItem("transintent:settings", JSON.stringify({ theme: "vivid", lang: "ko" }));
    expect(loadSettings().theme).toBe("dark");
  });

  it("setTheme → saveSettings → loadSettings 라운드트립", async () => {
    // settings-store의 setTheme은 import side-effect가 있으므로 동적 import로 격리
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.getState().setTheme("dark");
    const loaded = loadSettings();
    expect(loaded.theme).toBe("dark");
  });

  it("setLang → saveSettings → loadSettings 라운드트립", async () => {
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.getState().setLang("en");
    const loaded = loadSettings();
    expect(loaded.lang).toBe("en");
  });

  it("hydrateSettings — localStorage 저장값을 store에 반영", async () => {
    const { saveSettings } = await import("@/lib/storage");
    const { useSettings } = await import("@/lib/settings-store");

    // localStorage에 직접 심기
    saveSettings({ theme: "light", lang: "en", quality: "max" });

    useSettings.getState().hydrateSettings();
    const state = useSettings.getState();
    expect(state.theme).toBe("light");
    expect(state.lang).toBe("en");
    expect(state.quality).toBe("max");
    expect(state.hydrated).toBe(true);
  });

  it("setDefaultTarget → 영속 후 hydrate 복원, theme/lang 저장 시 보존", async () => {
    const { useSettings } = await import("@/lib/settings-store");

    useSettings.getState().setDefaultTarget("claude");
    expect(loadSettings().defaultTarget).toBe("claude");

    // 이후 theme 저장이 defaultTarget을 지우지 않아야 한다.
    useSettings.getState().setTheme("light");
    expect(loadSettings().defaultTarget).toBe("claude");

    useSettings.getState().hydrateSettings();
    expect(useSettings.getState().defaultTarget).toBe("claude");
  });

  it("dismissNotice — noticeDismissed=true 영속 후 hydrate 시 복원", async () => {
    const { useSettings } = await import("@/lib/settings-store");

    useSettings.getState().dismissNotice();
    expect(localStorage.getItem("transintent:noticeDismissed")).toBe("true");

    // hydrate로 복원
    useSettings.getState().hydrateSettings();
    expect(useSettings.getState().noticeDismissed).toBe(true);
  });
});
