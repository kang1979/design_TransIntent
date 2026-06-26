"use client";
// 작업영역 컨테이너 — store의 stage에 따라 입력/질문/결과/탐색 단계를 전환(활성 화면만 렌더).
import { useSession } from "@/lib/store";
import { HomeInput } from "./HomeInput";
import { QuestionStep } from "./QuestionStep";
import { ResultView } from "./ResultView";
import { ExploreView } from "./ExploreView";

export function Workspace() {
  const stage = useSession((s) => s.stage);

  if (stage === "questions") return <QuestionStep />;
  if (stage === "result") return <ResultView />;
  if (stage === "explore") return <ExploreView />;
  return <HomeInput />;
}
