"use client";
// V8 루트 클라 컨테이너 — 하이드레이션·영속·라우팅을 한 곳에서 관리.
// V9: settings(theme/lang) 하이드레이션 + document.documentElement.dataset.theme 적용.
// SSR 하이드레이션 불일치 방지: storage 접근은 전부 effect 안에서만.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell/AppShell";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { ContextPanel } from "@/components/ContextPanel/ContextPanel";
import { Workspace } from "@/components/Workspace/Workspace";
import { useSession } from "@/lib/store";
import { useSettings } from "@/lib/settings-store";
import { useProfiles } from "@/lib/profiles-store";
import { loadConversation } from "@/lib/storage";
import { persistSession, SAVED_EVENT } from "@/lib/persist";

type Props = {
  initialId?: string;
};

export function AppClient({ initialId }: Props) {
  const router = useRouter();
  const hydrate = useSession((s) => s.hydrate);
  const hydrateSettings = useSettings((s) => s.hydrateSettings);
  const hydrateProfiles = useProfiles((s) => s.hydrateProfiles);
  const theme = useSettings((s) => s.theme);
  const stage = useSession((s) => s.stage);

  // 저장 루프 방지용 직전 직렬화 ref.
  const lastSerializedRef = useRef<string>("");
  // 저장 실패(용량 초과) 1회만 고지하기 위한 ref.
  const saveFailedRef = useRef(false);

  // 설정·프로필 하이드레이션: 마운트 1회 — localStorage에서 theme/lang/noticeDismissed·My Context 읽기.
  useEffect(() => {
    hydrateSettings();
    hydrateProfiles();
  // zustand action — 렌더 간 안정.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme 변화 → <html data-theme> 적용. SSR 기본(dark)과 일치하므로 dark 사용자 FOUC 없음.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 딥링크 복원: initialId가 있으면 localStorage에서 로드해 store에 주입.
  useEffect(() => {
    if (!initialId) return;
    const current = useSession.getState().conversationId;
    if (current === initialId) return; // 이미 동일 대화 → skip

    const conv = loadConversation(initialId);
    if (conv) {
      hydrate(conv);
    } else {
      // 없는 ID — 루트로 리다이렉트
      router.replace("/");
    }
  // hydrate/router는 렌더 간 안정(useSession의 action, next/navigation). initialId만 deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  // 자동 저장: store 상태 변화 구독 → persistSession 호출.
  // 중복 저장 방지: 직렬화 결과가 같으면 skip.
  // 저장 무한루프 방지: subscribe 콜백에서 set 호출 없음.
  useEffect(() => {
    const unsubscribe = useSession.subscribe((state) => {
      // originalPrompt 빈 상태(초기/reset 직후)는 저장 skip.
      if (!state.originalPrompt.trim() || !state.conversationId) return;

      // 직렬화 동등 비교로 중복 저장 억제. stage·contextsDirty는 파생 상태라 제외
      // (복원 시 hydrate가 데이터에서 역추론). createdAt은 대화 내 불변이라 제외.
      const serialized = JSON.stringify({
        id: state.conversationId,
        originalPrompt: state.originalPrompt,
        title: state.title, // rename 반영 — dedup 키와 store 진실 일치
        preset: state.preset,
        questions: state.questions,
        contexts: state.contexts,
        messages: state.messages,
        metaPrompt: state.metaPrompt,
      });
      if (serialized === lastSerializedRef.current) return;
      lastSerializedRef.current = serialized;

      const ok = persistSession(state);
      if (!ok && !saveFailedRef.current) {
        // 용량 초과 등 저장 실패 — 무음 손실 방지 위해 1회 고지(Toast는 V9, 우선 콘솔 경고).
        saveFailedRef.current = true;
        console.warn("[TransIntent] 대화 저장에 실패했습니다(저장 공간 부족 가능). 오래된 대화를 삭제해 주세요.");
      } else if (ok) {
        saveFailedRef.current = false;
      }

      // 같은 탭의 Sidebar 목록 갱신 트리거.
      window.dispatchEvent(new CustomEvent(SAVED_EVENT));
    });

    return () => unsubscribe();
  }, []);

  // 맥락 패널은 질문·결과 단계에서만 노출(0003 showContextPanel).
  const showContextPanel = stage === "questions" || stage === "result";

  return (
    <AppShell
      sidebar={<Sidebar />}
      contextPanel={showContextPanel ? <ContextPanel /> : undefined}
    >
      <Workspace />
    </AppShell>
  );
}
