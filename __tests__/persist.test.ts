import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { toConversation, persistSession } from "@/lib/persist";
import { saveConversation, loadConversation, listConversations } from "@/lib/storage";
import { useSession } from "@/lib/store";

// store 상태 스냅샷에서 persist 관련 필드만 추출하는 헬퍼.
function snap() {
  const s = useSession.getState();
  return {
    originalPrompt: s.originalPrompt,
    conversationId: s.conversationId,
    createdAt: s.createdAt,
    preset: s.preset,
    questions: s.questions,
    contexts: s.contexts,
    messages: s.messages,
    metaPrompt: s.metaPrompt,
  };
}

beforeEach(() => {
  localStorage.clear();
  useSession.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks(); // Date.now 스파이가 다른 테스트로 새지 않도록 복원
});

describe("toConversation", () => {
  it("originalPrompt가 비어 있으면 null", () => {
    useSession.setState({ conversationId: "fixed-id", createdAt: 1000 });
    expect(toConversation(snap())).toBeNull();
  });

  it("conversationId가 ''이면 null", () => {
    useSession.setState({ originalPrompt: "내용", conversationId: "", createdAt: 1000 });
    expect(toConversation(snap())).toBeNull();
  });

  it("공백만 있는 originalPrompt는 null", () => {
    useSession.setState({ originalPrompt: "   ", conversationId: "id-1", createdAt: 1000 });
    expect(toConversation(snap())).toBeNull();
  });

  it("정상 입력 — title이 40자로 절단되고 … 추가", () => {
    const longPrompt = "가".repeat(50);
    useSession.setState({
      originalPrompt: longPrompt,
      conversationId: "id-2",
      createdAt: 1234,
    });
    const conv = toConversation(snap());
    expect(conv).not.toBeNull();
    expect(conv!.title).toBe("가".repeat(40) + "…");
    expect(conv!.title.length).toBe(41); // 40자 + …
  });

  it("정상 입력 — 40자 이하 title은 그대로", () => {
    useSession.setState({
      originalPrompt: "짧은 프롬프트",
      conversationId: "id-3",
      createdAt: 999,
    });
    const conv = toConversation(snap());
    expect(conv!.title).toBe("짧은 프롬프트");
  });

  it("result.metaPrompt 매핑", () => {
    useSession.setState({
      originalPrompt: "프롬프트",
      conversationId: "id-4",
      createdAt: 100,
      metaPrompt: "생성된 메타프롬프트",
    });
    const conv = toConversation(snap());
    expect(conv!.result.metaPrompt).toBe("생성된 메타프롬프트");
    expect(conv!.result.version).toBe(1);
  });

  it("createdAt 보존", () => {
    const ts = 1718000000000;
    useSession.setState({
      originalPrompt: "프롬프트",
      conversationId: "id-5",
      createdAt: ts,
    });
    const conv = toConversation(snap());
    expect(conv!.createdAt).toBe(ts);
  });
});

describe("라운드트립 — start→answer→setMetaPrompt → 저장 → 복원 → hydrate", () => {
  it("핵심 필드가 복원 후 일치하고 stage=result", () => {
    // 1) 새 대화 시작 (conversationId가 ""이므로 수동 주입)
    useSession.setState({
      originalPrompt: "여행 일정 짜줘",
      conversationId: "round-trip-id",
      createdAt: 1000,
      stage: "questions",
      questions: [
        { id: "q1", text: "톤은?", type: "single", skipped: false, answer: "친근하게" },
        { id: "q2", text: "기간은?", type: "short", skipped: false, answer: "3박4일" },
      ],
      metaPrompt: "",
    });

    // 2) 메타프롬프트 생성 완료
    useSession.getState().setMetaPrompt("완성된 메타프롬프트 내용");
    useSession.setState({ stage: "result" });

    // 3) toConversation → saveConversation (persistSession과 동일 경로)
    const conv = toConversation(snap());
    expect(conv).not.toBeNull();
    saveConversation(conv!);

    // 4) 다른 세션처럼 reset
    useSession.getState().reset();
    expect(useSession.getState().originalPrompt).toBe("");

    // 5) loadConversation → hydrate
    const loaded = loadConversation("round-trip-id");
    expect(loaded).not.toBeNull();
    useSession.getState().hydrate(loaded!);

    // 6) 복원 결과 검증
    const restored = useSession.getState();
    expect(restored.originalPrompt).toBe("여행 일정 짜줘");
    expect(restored.metaPrompt).toBe("완성된 메타프롬프트 내용");
    expect(restored.questions).toHaveLength(2);
    expect(restored.stage).toBe("result");
    expect(restored.conversationId).toBe("round-trip-id");
  });

  it("메타프롬프트 없는 대화 — stage=questions로 복원", () => {
    useSession.setState({
      originalPrompt: "코드 리뷰해줘",
      conversationId: "no-meta-id",
      createdAt: 2000,
      stage: "questions",
      questions: [
        { id: "q1", text: "언어는?", type: "single", skipped: false, answer: "TypeScript" },
      ],
      metaPrompt: "",
    });

    const conv = toConversation(snap());
    saveConversation(conv!);

    useSession.getState().reset();
    const loaded = loadConversation("no-meta-id");
    useSession.getState().hydrate(loaded!);

    expect(useSession.getState().stage).toBe("questions");
  });

  it("복원(동일 내용) 재저장은 updatedAt을 바꾸지 않는다 — 클릭만으로 정렬 불변", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    useSession.setState({
      originalPrompt: "여행 일정 짜줘",
      conversationId: "keep-id",
      createdAt: 1,
      metaPrompt: "메타",
    });
    persistSession(useSession.getState());
    const firstUpdatedAt = loadConversation("keep-id")!.updatedAt;
    expect(firstUpdatedAt).toBe(1000);

    // 다른 대화를 보다가 돌아온 것처럼 시간이 흐른 뒤 동일 내용으로 재저장(복원 시뮬).
    vi.spyOn(Date, "now").mockReturnValue(9999);
    const ok = persistSession(useSession.getState());
    expect(ok).toBe(true);
    expect(loadConversation("keep-id")!.updatedAt).toBe(firstUpdatedAt); // 불변
  });

  it("내용 변경 시에만 updatedAt 갱신 + 인덱스 상위 이동", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    // 대화 A(먼저), B(나중) 저장 — B가 상위.
    saveConversation({
      id: "A", title: "A", createdAt: 1, updatedAt: 1000,
      originalPrompt: "A", contexts: [], questions: [], messages: [],
      result: { metaPrompt: "", version: 1 },
    });
    vi.spyOn(Date, "now").mockReturnValue(2000);
    useSession.setState({
      originalPrompt: "B", conversationId: "B", createdAt: 2, metaPrompt: "",
    });
    persistSession(useSession.getState());
    expect(listConversations().map((m) => m.id)).toEqual(["B", "A"]);

    // A에서 실제 작업(맥락 추가) → 재저장 → A가 상위로 이동.
    vi.spyOn(Date, "now").mockReturnValue(3000);
    useSession.setState({
      originalPrompt: "A", conversationId: "A", createdAt: 1,
      contexts: [{ id: "ctx-1", category: "기타", label: "L", value: "V", source: "manual", enabled: true }],
      questions: [], messages: [], metaPrompt: "",
    });
    persistSession(useSession.getState());
    expect(loadConversation("A")!.updatedAt).toBe(3000); // 갱신
    expect(listConversations().map((m) => m.id)).toEqual(["A", "B"]); // 상위 이동
  });

  it("신규 대화(저장본 없음)는 정상 저장", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    useSession.setState({ originalPrompt: "신규", conversationId: "new-id", createdAt: 1 });
    expect(persistSession(useSession.getState())).toBe(true);
    expect(loadConversation("new-id")).not.toBeNull();
  });

  it("hydrate: 삭제 이력 있는 manual 맥락 복원 후 추가해도 id 충돌 없음(C1)", () => {
    // 저장된 contexts에 ctx-manual-2만 남아 length=1 — length 기반이면 seq=1로 충돌.
    useSession.setState({
      originalPrompt: "p",
      conversationId: "seq-id",
      createdAt: 1,
      contexts: [
        { id: "ctx-request", category: "목표", label: "요청", value: "p", source: "manual", enabled: true },
        { id: "ctx-manual-2", category: "기타", label: "X", value: "v", source: "manual", enabled: true },
      ],
      metaPrompt: "",
    });
    const conv = toConversation(snap());
    saveConversation(conv!);
    useSession.getState().reset();
    useSession.getState().hydrate(loadConversation("seq-id")!);

    // 다음 manual 추가는 ctx-manual-3 이어야(=max(2)+1), ctx-manual-2 재발급 금지.
    useSession.getState().addContext("새", "값");
    const ids = useSession.getState().contexts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // 전부 유일
    expect(ids).toContain("ctx-manual-3");
  });

  it("hydrate: chat 맥락 id(ctx-chat-N)도 seq 복원에 반영 — 복원 후 추가 시 충돌 없음", () => {
    useSession.setState({
      originalPrompt: "p",
      conversationId: "chat-seq",
      createdAt: 1,
      contexts: [
        { id: "ctx-request", category: "목표", label: "요청", value: "p", source: "manual", enabled: true },
        { id: "ctx-chat-4", category: "대화", label: "추가 요청", value: "표로", source: "chat", enabled: true },
      ],
      metaPrompt: "",
    });
    const conv = toConversation(snap());
    saveConversation(conv!);
    useSession.getState().reset();
    useSession.getState().hydrate(loadConversation("chat-seq")!);

    // 복원 후 chat/manual 추가는 max(4)+1=5부터 — ctx-chat-4 재발급 금지.
    useSession.getState().addChatContext("다음");
    const ids = useSession.getState().contexts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("ctx-chat-5");
  });
});
