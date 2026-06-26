// BrandMark — 2×2 회전 사각형 로고 (0003_dark 정본). 액센트 2 + 라이트 2.
// 순수 표현 컴포넌트(상태 없음) — Sidebar 헤더·Home 히어로 공용.
import styles from "./BrandMark.module.css";

type Props = {
  /** 외곽 정사각 한 변(px). 내부 도트는 비례 축소. */
  size?: number;
};

export function BrandMark({ size = 34 }: Props) {
  const dot = Math.round(size * 0.2);
  const gap = Math.max(2, Math.round(size * 0.09));
  const radius = Math.round(size * 0.32);
  return (
    <span
      className={styles.mark}
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden="true"
    >
      <span className={styles.grid} style={{ gap, gridTemplateColumns: `${dot}px ${dot}px` }}>
        <span className={styles.dotAccent} style={{ width: dot, height: dot }} />
        <span className={styles.dotLight} style={{ width: dot, height: dot }} />
        <span className={styles.dotLight} style={{ width: dot, height: dot }} />
        <span className={styles.dotAccent} style={{ width: dot, height: dot }} />
      </span>
    </span>
  );
}
