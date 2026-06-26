// store-result.test.ts — 0003 신규 세션 로직: 버전/재생성 신호/질문 모드/제목.
import { describe, it, expect, beforeEach } from "vitest";
import { useSession } from "@/lib/store";

beforeEach(() => useSession.getState().reset());

describe("버전 이력 (pushVersion / selectVersion / editCurrentVersion)", () => {
  it("pushVersion이 v1부터 누적하고 metaPrompt를 갱신", () => {
    const s = useSession.getState();
    s.pushVersion("first");
    expect(useSession.getState().versions).toEqual([{ v: 1, metaPrompt: "first" }]);
    expect(useSession.getState().resultVersion).toBe(1);
    expect(useSession.getState().metaPrompt).toBe("first");

    useSession.getState().pushVersion("second");
    expect(useSession.getState().versions.map((v) => v.v)).toEqual([1, 2]);
    expect(useSession.getState().resultVersion).toBe(2);
  });

  it("동일 텍스트 재push는 중복 버전을 만들지 않음(스트림 재마운트 idempotent)", () => {
    useSession.getState().pushVersion("same");
    useSession.getState().pushVersion("same");
    expect(useSession.getState().versions).toHaveLength(1);
  });

  it("selectVersion이 해당 버전 텍스트로 metaPrompt를 되돌림", () => {
    useSession.getState().pushVersion("v1text");
    useSession.getState().pushVersion("v2text");
    useSession.getState().selectVersion(1);
    expect(useSession.getState().resultVersion).toBe(1);
    expect(useSession.getState().metaPrompt).toBe("v1text");
  });

  it("editCurrentVersion이 현재 버전 텍스트만 갱신", () => {
    useSession.getState().pushVersion("orig");
    useSession.getState().editCurrentVersion("edited");
    expect(useSession.getState().metaPrompt).toBe("edited");
    expect(useSession.getState().versions[0]).toEqual({ v: 1, metaPrompt: "edited" });
  });
});

describe("재생성 신호 / 질문 모드 / 제목", () => {
  it("requestRegen이 regenSignal을 단조 증가", () => {
    const before = useSession.getState().regenSignal;
    useSession.getState().requestRegen();
    expect(useSession.getState().regenSignal).toBe(before + 1);
  });

  it("setQStyle / setQIndex 반영", () => {
    useSession.getState().setQStyle("all");
    useSession.getState().setQIndex(2);
    expect(useSession.getState().qStyle).toBe("all");
    expect(useSession.getState().qIndex).toBe(2);
  });

  it("setStage로 explore 단계 진입 가능", () => {
    useSession.getState().setStage("explore");
    expect(useSession.getState().stage).toBe("explore");
  });

  it("setTitle 반영 + reset이 모든 신규 필드를 초기화", () => {
    useSession.getState().setTitle("내 대화");
    useSession.getState().pushVersion("x");
    useSession.getState().setQStyle("all");
    useSession.getState().reset();
    const s = useSession.getState();
    expect(s.title).toBe("");
    expect(s.versions).toEqual([]);
    expect(s.resultVersion).toBe(0);
    expect(s.qStyle).toBe("step");
    expect(s.qIndex).toBe(0);
  });
});
