"use client";
// 대화 1건의 작업 세션 상태(단계/원본/프리셋/질문·답변/맥락/메시지). 서버 상태가 거의 없어 경량 store로 충분.
import { create } from "zustand";
import { sessionToContexts, syncQuestionContexts } from "@/lib/contexts";
import type { Conversation, ContextItem, Message, Preset, Question } from "@/types";

export type Stage = "input" | "questions" | "result" | "explore";

/** 질문 진행 스타일 — 하나씩(step) / 한 번에(all). 0003 디자인. */
export type QStyle = "step" | "all";

/** 결과 버전 — 재생성마다 누적. 0003 버전 칩. */
export type ResultVersion = { v: number; metaPrompt: string };

export type SessionState = {
  stage: Stage;
  originalPrompt: string;
  title: string; // 대화 제목(인라인 rename 반영). 빈 문자열이면 persist가 prompt에서 파생.
  preset?: Preset;
  questions: Question[];
  loadingQuestions: boolean;
  metaPrompt: string; // 생성된 메타프롬프트(스트림 누적 최종본 = 현재 선택 버전)
  contexts: ContextItem[];
  messages: Message[];
  contextsDirty: boolean; // 마지막 생성 이후 맥락/메시지 변경 여부
  contextSeq: number; // 수동 맥락 id 발급용 단조 증가 카운터(삭제와 무관 → id 충돌 방지)
  // 0003: 질문 진행 모드 + 단일(step) 진행 인덱스
  qStyle: QStyle;
  qIndex: number;
  // 0003: 결과 버전 이력(재생성 누적) + 현재 선택 버전
  versions: ResultVersion[];
  resultVersion: number;
  // 0003: 재생성 트리거 신호(ContextPanel·ChatComposer → ResultView 구독). 증가 시 재스트림.
  regenSignal: number;
  // 맥락 '수정' → 질문 이동 신호(ContextPanel → QuestionStep 구독). 스크롤 후 null로 clear.
  focusQuestionId: string | null;
  // V8 히스토리 식별자
  conversationId: string; // 저장된 대화의 ID ("" = 미저장 상태)
  createdAt: number; // 대화 생성 타임스탬프 (0 = 미시작)
  // actions
  start: (prompt: string, preset?: Preset) => void;
  setStage: (s: Stage) => void;
  setQuestions: (q: Question[]) => void;
  appendQuestions: (q: Question[]) => void;
  setLoadingQuestions: (b: boolean) => void;
  setMetaPrompt: (t: string) => void;
  answer: (id: string, value: string | string[]) => void;
  toggleSkip: (id: string) => void;
  // 0003: 질문 모드/진행
  setQStyle: (s: QStyle) => void;
  setQIndex: (i: number) => void;
  // 0003: 버전 — 생성 완료 시 push, 칩 클릭 시 select, 편집 저장 시 현재 버전 갱신
  pushVersion: (metaPrompt: string) => void;
  selectVersion: (v: number) => void;
  editCurrentVersion: (metaPrompt: string) => void;
  // 0003: 재생성 트리거 + 제목 변경
  requestRegen: () => void;
  setTitle: (title: string) => void;
  // 맥락 '수정' → 해당 질문으로 이동(없는 질문이면 no-op) + 처리 후 신호 해제
  focusQuestion: (questionId: string) => void;
  clearFocusQuestion: () => void;
  reset: () => void;
  // V8 히스토리 복원 action
  hydrate: (conv: Conversation) => void;
  // V6 맥락 편집 actions
  seedContexts: () => void;
  addContext: (label: string, value: string) => void;
  addContexts: (items: { label: string; value: string; category?: string; enabled?: boolean }[]) => void;
  updateContext: (id: string, patch: Partial<Pick<ContextItem, "value" | "label">>) => void;
  removeContext: (id: string) => void;
  toggleContext: (id: string) => void;
  addMessage: (m: Message) => void;
  addChatContext: (value: string) => void;
  markGenerated: () => void;
};

export const useSession = create<SessionState>((set, get) => ({
  stage: "input",
  originalPrompt: "",
  title: "",
  preset: undefined,
  questions: [],
  loadingQuestions: false,
  metaPrompt: "",
  contexts: [],
  messages: [],
  contextsDirty: false,
  contextSeq: 0,
  qStyle: "step",
  qIndex: 0,
  versions: [],
  resultVersion: 0,
  regenSignal: 0,
  focusQuestionId: null,
  conversationId: "",
  createdAt: 0,

  start: (originalPrompt, preset) =>
    set({
      originalPrompt,
      title: "",
      preset,
      stage: "questions",
      questions: [],
      loadingQuestions: true,
      metaPrompt: "",
      // 질문 단계 진입 즉시 기본 맥락(요청·도메인) 표시 → 이후 답변마다 질문 맥락이 누적된다.
      contexts: sessionToContexts(originalPrompt, [], preset),
      messages: [],
      contextsDirty: false,
      contextSeq: 0,
      qStyle: "step",
      qIndex: 0,
      versions: [],
      resultVersion: 0,
      conversationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }),
  setStage: (stage) => set({ stage }),
  setQuestions: (questions) => set({ questions, loadingQuestions: false }),
  appendQuestions: (q) => set((s) => ({ questions: [...s.questions, ...q] })),
  setLoadingQuestions: (loadingQuestions) => set({ loadingQuestions }),
  setMetaPrompt: (metaPrompt) => set({ metaPrompt }),
  // 답변 저장 + 맥락 바 즉시 동기화(질문 답할 때마다 반영). manual/chat 맥락은 머지로 보존.
  // dirty 표시 → 결과 복귀 시 재생성(새 버전) + result 단계 "다시 생성" 버튼 활성화 신호.
  answer: (id, value) =>
    set((s) => {
      const questions = s.questions.map((q) =>
        q.id === id ? { ...q, answer: value, skipped: false } : q,
      );
      return {
        questions,
        contexts: syncQuestionContexts(s.originalPrompt, questions, s.preset, s.contexts),
        contextsDirty: true,
      };
    }),
  toggleSkip: (id) =>
    set((s) => {
      const questions = s.questions.map((q) =>
        q.id === id ? { ...q, skipped: !q.skipped, answer: undefined } : q,
      );
      return {
        questions,
        contexts: syncQuestionContexts(s.originalPrompt, questions, s.preset, s.contexts),
        contextsDirty: true,
      };
    }),

  setQStyle: (qStyle) => set({ qStyle }),
  setQIndex: (qIndex) => set({ qIndex }),

  // 생성 완료 시 새 버전 누적. 동일 텍스트 재push 방지(스트림 재마운트 idempotent).
  pushVersion: (metaPrompt) =>
    set((s) => {
      const last = s.versions[s.versions.length - 1];
      if (last && last.metaPrompt === metaPrompt) return { metaPrompt };
      const v = (last?.v ?? 0) + 1;
      return { versions: [...s.versions, { v, metaPrompt }], resultVersion: v, metaPrompt };
    }),

  selectVersion: (v) =>
    set((s) => {
      const ver = s.versions.find((x) => x.v === v);
      return ver ? { resultVersion: v, metaPrompt: ver.metaPrompt } : {};
    }),

  editCurrentVersion: (metaPrompt) =>
    set((s) => ({
      metaPrompt,
      versions: s.versions.map((ver) => (ver.v === s.resultVersion ? { ...ver, metaPrompt } : ver)),
    })),

  requestRegen: () => set((s) => ({ regenSignal: s.regenSignal + 1 })),
  setTitle: (title) => set({ title }),

  // 질문 유래 맥락의 '수정' → 그 질문으로 이동. result 단계였으면 questions로 복귀.
  focusQuestion: (questionId) => {
    const idx = get().questions.findIndex((q) => q.id === questionId);
    if (idx < 0) return; // 매칭 질문 없음(manual/도메인 등) → 호출부가 인라인 편집으로 폴백
    set({ stage: "questions", qIndex: idx, focusQuestionId: questionId });
  },
  clearFocusQuestion: () => set({ focusQuestionId: null }),

  reset: () =>
    set({
      stage: "input",
      originalPrompt: "",
      title: "",
      preset: undefined,
      questions: [],
      loadingQuestions: false,
      metaPrompt: "",
      contexts: [],
      messages: [],
      contextsDirty: false,
      contextSeq: 0,
      qStyle: "step",
      qIndex: 0,
      versions: [],
      resultVersion: 0,
      regenSignal: 0,
      focusQuestionId: null,
      conversationId: "",
      createdAt: 0,
    }),

  // V8 히스토리 복원: 저장된 대화를 store에 주입. stage는 데이터에서 역추론.
  hydrate: (conv: Conversation) => {
    const stage: Stage = conv.result.metaPrompt
      ? "result"
      : conv.questions.length
        ? "questions"
        : "input";
    // 기존 seq 발급 id(ctx-manual-N·ctx-chat-N)의 최대 N+1로 seq 복원 — length 기반은 삭제 이력 시 충돌하므로 금지.
    const contextSeq = conv.contexts.reduce((max, c) => {
      const m = /^ctx-(?:manual|chat)-(\d+)$/.exec(c.id);
      return m ? Math.max(max, Number(m[1]) + 1) : max;
    }, 0);
    const metaPrompt = conv.result.metaPrompt;
    set({
      conversationId: conv.id,
      createdAt: conv.createdAt,
      originalPrompt: conv.originalPrompt,
      title: conv.title,
      preset: conv.preset,
      questions: conv.questions,
      contexts: conv.contexts,
      messages: conv.messages,
      metaPrompt,
      stage,
      contextsDirty: false,
      loadingQuestions: false,
      contextSeq,
      qStyle: "step",
      qIndex: 0,
      // 저장 모델은 단일 결과만 보존 → 복원 시 v1 단일 버전으로 시작.
      versions: metaPrompt ? [{ v: 1, metaPrompt }] : [],
      resultVersion: metaPrompt ? 1 : 0,
    });
  },

  // V6 맥락 편집 actions
  // 생성 직전 최종 동기화. 머지라 질문 단계에서 추가한 manual 맥락을 보존하면서 멱등.
  seedContexts: () => {
    const { originalPrompt, questions, preset, contexts } = get();
    set({
      contexts: syncQuestionContexts(originalPrompt, questions, preset, contexts),
      contextsDirty: false,
    });
  },

  addContext: (label, value) =>
    set((s) => ({
      contexts: [
        ...s.contexts,
        {
          // 단조 증가 seq로 발급 — 삭제 후 동일 레이블 재추가 시에도 id 충돌 없음.
          id: `ctx-manual-${s.contextSeq}`,
          category: "기타",
          label,
          value,
          source: "manual",
          enabled: true,
        } satisfies ContextItem,
      ],
      contextSeq: s.contextSeq + 1,
      contextsDirty: true,
    })),

  // My Context 프로필 불러오기: 저장 맥락을 manual 맥락으로 일괄 주입(id는 seq로 재발급 → 충돌 방지).
  // enabled는 저장 시점 상태를 보존(미지정이면 활성). 빈 배열은 상태 불변(불필요한 dirty 방지).
  addContexts: (items) =>
    set((s) => {
      if (items.length === 0) return s;
      let seq = s.contextSeq;
      const added: ContextItem[] = items.map((it) => ({
        id: `ctx-manual-${seq++}`,
        category: it.category || "기타",
        label: it.label,
        value: it.value,
        source: "manual",
        enabled: it.enabled ?? true,
      }));
      return { contexts: [...s.contexts, ...added], contextSeq: seq, contextsDirty: true };
    }),

  updateContext: (id, patch) =>
    set((s) => ({
      contexts: s.contexts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      contextsDirty: true,
    })),

  removeContext: (id) =>
    set((s) => ({
      contexts: s.contexts.filter((c) => c.id !== id),
      contextsDirty: true,
    })),

  toggleContext: (id) =>
    set((s) => ({
      contexts: s.contexts.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
      contextsDirty: true,
    })),

  addMessage: (m) =>
    set((s) => ({
      messages: [...s.messages, m],
      contextsDirty: true,
    })),

  // 대화 보강 입력 → 'chat' 맥락으로 추가(맥락 바에 노출·수정/삭제 가능). messages 대신 contexts에 넣어
  // 서버 프롬프트("# Context")에 한 번만 반영(중복 방지). id는 manual과 같은 contextSeq로 발급.
  addChatContext: (value) =>
    set((s) => ({
      contexts: [
        ...s.contexts,
        {
          id: `ctx-chat-${s.contextSeq}`,
          category: "대화",
          label: "추가 요청",
          value,
          source: "chat",
          enabled: true,
        } satisfies ContextItem,
      ],
      contextSeq: s.contextSeq + 1,
      contextsDirty: true,
    })),

  markGenerated: () => set({ contextsDirty: false }),
}));
