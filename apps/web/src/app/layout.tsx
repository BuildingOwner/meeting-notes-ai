import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
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
      <body className="bg-canvas text-ink min-h-screen flex">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto pt-12 md:pt-0">{children}</main>
      </body>
    </html>
  );
}
