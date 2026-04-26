import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExP 팀 경매 프로그램",
  description: "ExP 팀 경매 및 드래프트 프로그램",
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
