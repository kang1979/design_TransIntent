"use client";
// ThemeToggle — dark(기본)/light 2선택 라디오 그룹. 0003_dark 정본.
// 인벤토리: 공통, LocalStorage 저장. a11y: role="radiogroup", :focus-visible.
import { useSettings } from "@/lib/settings-store";
import styles from "./ThemeToggle.module.css";

const THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
] as const;

export function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  return (
    <div className={styles.root} role="radiogroup" aria-label="테마 선택">
      {THEMES.map((t) => (
        <label key={t.value} className={styles.option} data-active={theme === t.value ? "true" : "false"}>
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={theme === t.value}
            onChange={() => setTheme(t.value)}
            className={styles.radio}
            aria-label={`${t.label} 테마`}
          />
          <span className={styles.label}>{t.label}</span>
        </label>
      ))}
    </div>
  );
}
