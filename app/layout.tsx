import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

// 0003_dark 정본 폰트: 본문 DM Sans · 디스플레이/모노 Space Grotesk.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TransIntent — 메타 프롬프트 생성기",
  description:
    "거친 한 줄 프롬프트를 객관식 질문으로 구조화해 메타 프롬프트를 생성하고, 원하는 AI 챗으로 바로 열어주는 웹 서비스.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-theme="dark" className={`${dmSans.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
