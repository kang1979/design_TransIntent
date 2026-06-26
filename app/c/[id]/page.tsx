// 대화 복원 딥링크 라우트 (FR-9). 서버 컴포넌트.
// Next.js 15+ 에서 params는 Promise — await로 받아야 한다.
import { AppClient } from "@/components/App/AppClient";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  return <AppClient initialId={id} />;
}
