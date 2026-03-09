import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "경매 프로그램 | LoL 자낳대 팀 경매 시스템",
  description: "리그 오브 레전드 스트리머 대회(자낳대) 팀 경매 및 드래프트 프로그램",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
