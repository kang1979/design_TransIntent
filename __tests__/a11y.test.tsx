// a11y.test.tsx — ThemeToggle/LangToggle/NoticeBanner 접근가능한 이름 스모크 검증 (V9)
// @testing-library/react 사용. axe 라이브러리 없이 getByRole로 검증.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

beforeEach(() => localStorage.clear());

describe("ThemeToggle — a11y 스모크", () => {
  it("role=radiogroup + aria-label='테마 선택' 존재", async () => {
    const { ThemeToggle } = await import("@/components/common/ThemeToggle");
    render(<ThemeToggle />);
    const group = screen.getByRole("radiogroup", { name: "테마 선택" });
    expect(group).toBeTruthy();
  });

  it("dark/light 2개 라디오 버튼 모두 접근가능한 이름 보유", async () => {
    const { ThemeToggle } = await import("@/components/common/ThemeToggle");
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Dark 테마" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Light 테마" })).toBeTruthy();
  });

  it("Light 라디오 클릭 시 store theme이 'light'로 변경", async () => {
    const { ThemeToggle } = await import("@/components/common/ThemeToggle");
    const { useSettings } = await import("@/lib/settings-store");
    // 초기화
    useSettings.setState({ theme: "dark", lang: "ko" });

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("radio", { name: "Light 테마" }));
    expect(useSettings.getState().theme).toBe("light");
  });
});

describe("LangToggle — a11y 스모크", () => {
  it("role=radiogroup + aria-label='출력 언어 선택' 존재", async () => {
    const { LangToggle } = await import("@/components/common/LangToggle");
    render(<LangToggle />);
    const group = screen.getByRole("radiogroup", { name: "출력 언어 선택" });
    expect(group).toBeTruthy();
  });

  it("한국어/영어 라디오 버튼 접근가능한 이름 보유", async () => {
    const { LangToggle } = await import("@/components/common/LangToggle");
    render(<LangToggle />);
    expect(screen.getByRole("radio", { name: "한국어" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "영어" })).toBeTruthy();
  });

  it("영어 라디오 클릭 시 store lang이 'en'으로 변경", async () => {
    const { LangToggle } = await import("@/components/common/LangToggle");
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.setState({ theme: "dark", lang: "ko" });

    render(<LangToggle />);
    fireEvent.click(screen.getByRole("radio", { name: "영어" }));
    expect(useSettings.getState().lang).toBe("en");
  });
});

describe("NoticeBanner — a11y 스모크", () => {
  it("hydrated=false이면 렌더 없음(SSR 하이드레이션 불일치 방지)", async () => {
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.setState({ hydrated: false, noticeDismissed: false });

    const { NoticeBanner } = await import("@/components/common/NoticeBanner");
    const { container } = render(<NoticeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("hydrated=true, noticeDismissed=false → role='region' + aria-label='고지' 존재", async () => {
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.setState({ hydrated: true, noticeDismissed: false });

    const { NoticeBanner } = await import("@/components/common/NoticeBanner");
    render(<NoticeBanner />);
    const region = screen.getByRole("region", { name: "고지" });
    expect(region).toBeTruthy();
  });

  it("닫기 버튼에 aria-label='고지 닫기' 존재", async () => {
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.setState({ hydrated: true, noticeDismissed: false });

    const { NoticeBanner } = await import("@/components/common/NoticeBanner");
    render(<NoticeBanner />);
    const closeBtn = screen.getByRole("button", { name: "고지 닫기" });
    expect(closeBtn).toBeTruthy();
  });

  it("닫기 버튼 클릭 시 noticeDismissed=true로 전환", async () => {
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.setState({ hydrated: true, noticeDismissed: false });

    const { NoticeBanner } = await import("@/components/common/NoticeBanner");
    render(<NoticeBanner />);
    fireEvent.click(screen.getByRole("button", { name: "고지 닫기" }));
    expect(useSettings.getState().noticeDismissed).toBe(true);
  });

  it("noticeDismissed=true이면 렌더 없음", async () => {
    const { useSettings } = await import("@/lib/settings-store");
    useSettings.setState({ hydrated: true, noticeDismissed: true });

    const { NoticeBanner } = await import("@/components/common/NoticeBanner");
    const { container } = render(<NoticeBanner />);
    expect(container.firstChild).toBeNull();
  });
});
