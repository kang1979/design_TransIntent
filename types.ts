// 데이터 모델 (PRD 7장 / ARCHITECTURE_v2 §7). 저장 포맷 버전은 schemaVersion으로 분리.

export type Preset = "writing" | "coding" | "image" | "research" | "planning";

export type ContextSource = "question" | "manual" | "chat";

export type ContextItem = {
  id: string;
  category: string; // 역할/목표/대상/톤/출력형식/분량/제약 ...
  label: string;
  value: string;
  source: ContextSource;
  enabled: boolean;
};

export type Question = {
  id: string;
  text: string;
  type: "single" | "multi" | "short";
  options?: string[];
  answer?: string | string[];
  skipped: boolean;
};

export type Message = { role: "user" | "assistant"; content: string };

/** 생성 품질 모드: fast=의도분석→생성 1패스 / max=초안→자기검토→최종(정제 루프). */
export type QualityMode = "fast" | "max";

/**
 * 의도 브리프 — 생성 전 Stage A에서 추출하는 구조화 의도(맥락→메타프롬프트 품질의 핵심).
 * 사용자 원문·맥락에서 "무엇을, 누구를 위해, 어떤 기준으로" 만들지 추론한다.
 * successCriteria가 곧 자기검토(max 모드)의 rubric이 된다.
 */
export type IntentBrief = {
  goal: string; // 사용자가 진짜 이루려는 것(원문보다 구체적)
  audience: string; // 최종 결과물의 대상/독자
  implicitNeeds: string[]; // 명시되지 않았지만 품질을 좌우하는 암묵 요구
  targetAI?: string; // 이 메타프롬프트를 넣을 타깃 AI(GPT/Claude/Gemini 등) 추정
  successCriteria: string[]; // 좋은 결과의 판정 기준(=rubric)
  risks: string[]; // 흔한 실패/오해 지점
  recommendedStructure: string; // 메타프롬프트에 권장되는 섹션 구성
};

export type ConversationResult = {
  metaPrompt: string;
  editedMetaPrompt?: string;
  version: number; // 메타프롬프트 콘텐츠 버전(저장 포맷 버전 아님)
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  originalPrompt: string;
  preset?: Preset;
  contexts: ContextItem[];
  questions: Question[];
  result: ConversationResult;
  messages: Message[];
  approxTokens?: number; // 누적 토큰 추정(상한 관리용)
};

/** 저장 포맷 버전(마이그레이션 키). result.version과 구분된다. */
export const SCHEMA_VERSION = 1 as const;

export type StoredConversation = Conversation & { schemaVersion: number };

export type ConversationMeta = { id: string; title: string; updatedAt: number };

/** My Context — 재사용 가능한 맥락 프로필(여러 대화에 불러쓰는 저장 맥락 묶음). */
export type ContextProfile = {
  id: string;
  name: string;
  contexts: ContextItem[];
  createdAt: number;
  updatedAt: number;
};

export type StoredProfile = ContextProfile & { schemaVersion: number };

export type ProfileMeta = { id: string; name: string; updatedAt: number };

export type Theme = "dark" | "light";

export type Settings = {
  theme: Theme; // 0003_dark 정본: 다크(기본)·라이트 2모드
  lang: "ko" | "en";
  defaultTarget?: string; // 기본 대상 AI 챗 어댑터 id
  quality: QualityMode; // 생성 품질 모드(fast 기본 / max 정제 루프)
};
