// 딥링크 열기 로직 (ARCH §6-B). 어떤 AI 챗도 URL 프리필이 신뢰 불가하므로(2026 현실),
// UI는 "복사 → 안내 카드 → 사용자가 직접 열기"로 통일한다. 여기선 열 URL 계산만 담당.
import adaptersJson from "@/config/chat-adapters.json";
import { AdaptersSchema, type ChatAdapter } from "./deeplink.types";

const DEFAULT_MAX_URL = 2000;

// 앱 시작 시 1회 검증 — 잘못된 어댑터(예: fallbackUrl 누락)를 조기 차단.
export const adapters: ChatAdapter[] = AdaptersSchema.parse(adaptersJson);

/** 순수 결정 함수: 프리필 URL과 폴백 필요 여부를 계산(DOM 무관 — 단위테스트 대상). */
export function resolveOpen(
  adapter: ChatAdapter,
  prompt: string,
): { url: string | null; needsFallback: boolean } {
  const max = adapter.maxUrlLength ?? DEFAULT_MAX_URL;
  const url = adapter.template ? adapter.template.replace("{q}", encodeURIComponent(prompt)) : null;
  const needsFallback = Boolean(adapter.forceFallback) || !url || url.length > max;
  return { url, needsFallback };
}

/**
 * 실제로 열 URL을 고른다. **프리필 신뢰 사이트(prefillReliable)에서만** 프리필 URL을 쓰고,
 * 그 외엔 항상 깨끗한 fallbackUrl(붙여넣기 전제 — 비신뢰 ?q= URL의 자동전송 혼란 회피).
 * 현재 활성 어댑터 중 prefillReliable인 곳은 없다(전부 fallbackUrl) — 플래그는 향후용 도먼트.
 */
export function pickOpenUrl(adapter: ChatAdapter, prompt: string): string {
  const { url, needsFallback } = resolveOpen(adapter, prompt);
  if (adapter.prefillReliable && !needsFallback && url) return url;
  return adapter.fallbackUrl;
}
