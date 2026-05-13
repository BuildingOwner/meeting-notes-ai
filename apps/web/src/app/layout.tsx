import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "meeting-notes-ai",
  description: "음성 녹음 → 회의록 자동 생성 → Notion",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-parchment text-ink min-h-screen">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
