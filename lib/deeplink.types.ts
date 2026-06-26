// 딥링크 어댑터 타입 + Zod 런타임 검증 (ARCH §6-A). fallbackUrl 필수 — window.open(undefined) 차단.
import { z } from "zod";

export type ChatAdapter = {
  id: string;
  label: string;
  template: string | null; // "{q}" 포함. null이면 강제 폴백
  prefillReliable?: boolean; // true면 프리필이 안정적(확신 문구). 현실상 Perplexity만. 미지정=불확실
  fallbackUrl: string; // 필수
  forceFallback?: boolean;
  maxUrlLength?: number; // 기본 2000
};

export const AdapterSchema = z.object({
  id: z.string(),
  label: z.string(),
  template: z.string().includes("{q}").nullable(),
  prefillReliable: z.boolean().optional(),
  fallbackUrl: z.string().url(),
  forceFallback: z.boolean().optional(),
  maxUrlLength: z.number().int().positive().optional(),
});

export const AdaptersSchema = z.array(AdapterSchema);
