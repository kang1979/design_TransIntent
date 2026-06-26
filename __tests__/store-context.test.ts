import { describe, it, expect, beforeEach } from "vitest";
import { useSession } from "@/lib/store";
import type { Question } from "@/types";

const q = (over: Partial<Question> & { id: string; text: string }): Question => ({
  type: "single",
  skipped: false,
  ...over,
});

beforeEach(() => {
  useSession.getState().reset();
});

describe("store — V6 맥락 편집", () => {
  describe("seedContexts", () => {
    it("원본 프롬프트 + 답변된 질문으로 contexts를 채우고 dirty=false", () => {
      useSession.setState({
        originalPrompt: "여행 계획 짜줘",
        questions: [
          q({ id: "q1", text: "톤은?", answer: "친근하게" }),
          q({ id: "q2", text: "분량은?", answer: undefined }), // 미응답 → 제외
          q({ id: "q3", text: "목적은?", skipped: true }), // 스킵 → 제외
        ],
      });

      useSession.getState().seedContexts();

      const { contexts, contextsDirty } = useSession.getState();
      // ctx-request(원본) + ctx-q1(답변된 것) 만 포함
      expect(contexts.some((c) => c.id === "ctx-request")).toBe(true);
      expect(contexts.some((c) => c.id === "ctx-q1")).toBe(true);
      expect(contexts.some((c) => c.id === "ctx-q2")).toBe(false);
      expect(contexts.some((c) => c.id === "ctx-q3")).toBe(false);
      expect(contextsDirty).toBe(false);
    });

    it("빈 프롬프트·질문이면 빈 배열, dirty=false", () => {
      useSession.getState().seedContexts();
      const { contexts, contextsDirty } = useSession.getState();
      expect(contexts).toHaveLength(0);
      expect(contextsDirty).toBe(false);
    });
  });

  describe("answer/toggleSkip — 맥락 바 즉시 반영", () => {
    it("answer 시 contexts에 해당 질문 맥락이 즉시 추가", () => {
      useSession.setState({
        originalPrompt: "여행 계획",
        questions: [q({ id: "q1", text: "톤은?" }), q({ id: "q2", text: "분량은?" })],
        contexts: [],
      });
      useSession.getState().answer("q1", "친근하게");
      const { contexts, contextsDirty } = useSession.getState();
      expect(contexts.find((c) => c.id === "ctx-q1")).toMatchObject({ value: "친근하게" });
      expect(contexts.some((c) => c.id === "ctx-q2")).toBe(false); // 미답변은 아직 없음
      expect(contextsDirty).toBe(true); // 답변 변경 → dirty(복귀 시 재생성/버튼 활성 신호)
    });

    it("toggleSkip로 스킵하면 해당 질문 맥락이 제거 + dirty", () => {
      useSession.setState({
        originalPrompt: "여행 계획",
        questions: [q({ id: "q1", text: "톤은?", answer: "친근하게" })],
        contexts: [],
      });
      useSession.getState().answer("q1", "친근하게");
      expect(useSession.getState().contexts.some((c) => c.id === "ctx-q1")).toBe(true);
      useSession.getState().markGenerated(); // dirty 초기화 후
      useSession.getState().toggleSkip("q1");
      expect(useSession.getState().contexts.some((c) => c.id === "ctx-q1")).toBe(false);
      expect(useSession.getState().contextsDirty).toBe(true); // 스킵 변경도 dirty
    });

    it("직접 추가한 manual 맥락은 답변 후에도 보존", () => {
      useSession.setState({ originalPrompt: "여행", questions: [q({ id: "q1", text: "톤은?" })], contexts: [] });
      useSession.getState().addContext("언어", "한국어"); // ctx-manual-0
      useSession.getState().answer("q1", "친근하게");
      const ids = useSession.getState().contexts.map((c) => c.id);
      expect(ids).toContain("ctx-manual-0");
      expect(ids).toContain("ctx-q1");
    });
  });

  describe("addContext", () => {
    it("항목을 push하고 dirty=true", () => {
      useSession.getState().addContext("언어", "한국어");
      const { contexts, contextsDirty } = useSession.getState();
      expect(contexts).toHaveLength(1);
      expect(contexts[0]).toMatchObject({
        label: "언어",
        value: "한국어",
        source: "manual",
        enabled: true,
        category: "기타",
      });
      expect(contextsDirty).toBe(true);
    });

    it("id가 단조 seq 기반으로 결정적으로 생성(Math.random 없음)", () => {
      useSession.getState().addContext("A", "1");
      useSession.getState().addContext("B", "2");
      const { contexts } = useSession.getState();
      expect(contexts[0].id).toBe("ctx-manual-0");
      expect(contexts[1].id).toBe("ctx-manual-1");
    });

    it("삭제 후 동일 레이블 재추가해도 id가 충돌하지 않는다(M1)", () => {
      const s = useSession.getState();
      s.addContext("B", "1"); // ctx-manual-0
      s.addContext("B", "2"); // ctx-manual-1
      useSession.getState().removeContext("ctx-manual-0");
      useSession.getState().addContext("B", "3"); // 길이 1이지만 seq=2 → ctx-manual-2
      const ids = useSession.getState().contexts.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length); // 전부 유일
      expect(ids).toContain("ctx-manual-2");
    });
  });

  describe("updateContext", () => {
    it("지정 id의 value를 갱신하고 dirty=true", () => {
      useSession.setState({ contexts: [{ id: "x", category: "기타", label: "라벨", value: "기존", source: "manual", enabled: true }] });
      useSession.getState().updateContext("x", { value: "신규" });
      const { contexts, contextsDirty } = useSession.getState();
      expect(contexts[0].value).toBe("신규");
      expect(contextsDirty).toBe(true);
    });

    it("label도 갱신 가능", () => {
      useSession.setState({ contexts: [{ id: "y", category: "기타", label: "옛라벨", value: "v", source: "manual", enabled: true }] });
      useSession.getState().updateContext("y", { label: "새라벨" });
      expect(useSession.getState().contexts[0].label).toBe("새라벨");
    });
  });

  describe("removeContext", () => {
    it("지정 id를 제거하고 dirty=true", () => {
      useSession.setState({
        contexts: [
          { id: "a", category: "기타", label: "A", value: "1", source: "manual", enabled: true },
          { id: "b", category: "기타", label: "B", value: "2", source: "manual", enabled: true },
        ],
      });
      useSession.getState().removeContext("a");
      const { contexts, contextsDirty } = useSession.getState();
      expect(contexts).toHaveLength(1);
      expect(contexts[0].id).toBe("b");
      expect(contextsDirty).toBe(true);
    });
  });

  describe("toggleContext", () => {
    it("enabled를 반전하고 dirty=true", () => {
      useSession.setState({
        contexts: [{ id: "t", category: "기타", label: "T", value: "v", source: "manual", enabled: true }],
      });
      useSession.getState().toggleContext("t");
      const { contexts, contextsDirty } = useSession.getState();
      expect(contexts[0].enabled).toBe(false);
      expect(contextsDirty).toBe(true);
    });

    it("모두 비활성화해도 배열 길이 유지(enabled만 false)", () => {
      useSession.setState({
        contexts: [
          { id: "a", category: "기타", label: "A", value: "1", source: "manual", enabled: true },
          { id: "b", category: "기타", label: "B", value: "2", source: "manual", enabled: true },
        ],
      });
      useSession.getState().toggleContext("a");
      useSession.getState().toggleContext("b");
      const { contexts } = useSession.getState();
      expect(contexts).toHaveLength(2);
      expect(contexts.every((c) => !c.enabled)).toBe(true);
    });
  });

  describe("addMessage", () => {
    it("messages에 push하고 dirty=true", () => {
      useSession.getState().addMessage({ role: "user", content: "더 자세히" });
      const { messages, contextsDirty } = useSession.getState();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ role: "user", content: "더 자세히" });
      expect(contextsDirty).toBe(true);
    });
  });

  describe("addChatContext", () => {
    it("'chat' 맥락으로 contexts에 추가(맥락 바 반영) + dirty=true, messages는 불변", () => {
      useSession.getState().addChatContext("표로 정리해줘");
      const { contexts, messages, contextsDirty } = useSession.getState();
      expect(contexts).toHaveLength(1);
      expect(contexts[0]).toMatchObject({
        id: "ctx-chat-0",
        value: "표로 정리해줘",
        source: "chat",
        enabled: true,
      });
      expect(messages).toHaveLength(0); // 채팅 입력은 더 이상 messages로 가지 않음(중복 방지)
      expect(contextsDirty).toBe(true);
    });

    it("manual과 contextSeq를 공유 — id 충돌 없이 단조 증가", () => {
      const s = useSession.getState();
      s.addContext("A", "1"); // ctx-manual-0
      s.addChatContext("2"); // ctx-chat-1
      s.addContext("B", "3"); // ctx-manual-2
      const ids = useSession.getState().contexts.map((c) => c.id);
      expect(ids).toEqual(["ctx-manual-0", "ctx-chat-1", "ctx-manual-2"]);
    });
  });

  describe("markGenerated", () => {
    it("dirty를 false로 되돌린다", () => {
      useSession.getState().addContext("x", "y"); // dirty=true
      expect(useSession.getState().contextsDirty).toBe(true);
      useSession.getState().markGenerated();
      expect(useSession.getState().contextsDirty).toBe(false);
    });
  });

  describe("reset", () => {
    it("contexts·messages·contextsDirty도 초기화", () => {
      useSession.getState().addContext("L", "V");
      useSession.getState().addMessage({ role: "user", content: "msg" });
      useSession.getState().reset();
      const { contexts, messages, contextsDirty } = useSession.getState();
      expect(contexts).toHaveLength(0);
      expect(messages).toHaveLength(0);
      expect(contextsDirty).toBe(false);
    });
  });

  describe("focusQuestion (맥락 수정 → 질문 이동)", () => {
    it("해당 질문으로 stage=questions·qIndex·focusQuestionId 설정", () => {
      useSession.setState({
        stage: "result",
        questions: [q({ id: "q1", text: "톤은?" }), q({ id: "q2", text: "분량은?" })],
      });
      useSession.getState().focusQuestion("q2");
      const s = useSession.getState();
      expect(s.stage).toBe("questions");
      expect(s.qIndex).toBe(1);
      expect(s.focusQuestionId).toBe("q2");
    });

    it("없는 질문 id는 no-op(stage·focusQuestionId 불변)", () => {
      useSession.setState({ stage: "result", questions: [q({ id: "q1", text: "톤은?" })] });
      useSession.getState().focusQuestion("ctx-preset"); // 매칭 질문 없음
      const s = useSession.getState();
      expect(s.stage).toBe("result");
      expect(s.focusQuestionId).toBeNull();
    });

    it("clearFocusQuestion이 신호를 null로 해제", () => {
      useSession.setState({ questions: [q({ id: "q1", text: "톤은?" })] });
      useSession.getState().focusQuestion("q1");
      expect(useSession.getState().focusQuestionId).toBe("q1");
      useSession.getState().clearFocusQuestion();
      expect(useSession.getState().focusQuestionId).toBeNull();
    });
  });
});
