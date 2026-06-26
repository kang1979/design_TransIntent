"use client";
// LangToggle — ko/en 언어 토글.
// 인벤토리: 공통. a11y: role="radiogroup", aria-checked, :focus-visible.
import { useSettings } from "@/lib/settings-store";
import styles from "./LangToggle.module.css";

const LANGS = [
  { value: "ko", label: "한" },
  { value: "en", label: "EN" },
] as const;

export function LangToggle() {
  const lang = useSettings((s) => s.lang);
  const setLang = useSettings((s) => s.setLang);

  return (
    <div className={styles.root} role="radiogroup" aria-label="출력 언어 선택">
      {LANGS.map((l) => (
        <label key={l.value} className={styles.option} data-active={lang === l.value ? "true" : "false"}>
          <input
            type="radio"
            name="lang"
            value={l.value}
            checked={lang === l.value}
            onChange={() => setLang(l.value)}
            className={styles.radio}
            aria-label={l.value === "ko" ? "한국어" : "영어"}
          />
          <span className={styles.label}>{l.label}</span>
        </label>
      ))}
    </div>
  );
}
