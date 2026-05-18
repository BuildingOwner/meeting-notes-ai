"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const isJobsActive = pathname === "/" || pathname.startsWith("/jobs/");
  const isUploadActive = pathname === "/upload";

  return (
    <>
      {/* ── Mobile: fixed top bar ── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 h-12 bg-canvas border-b border-hairline flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-on-primary text-xs font-bold shrink-0">
            M
          </span>
          <span className="text-body-sm font-semibold text-ink">meeting-notes-ai</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className={`text-body-sm transition-colors ${isJobsActive ? "text-ink font-medium" : "text-slate"}`}
          >
            Jobs
          </Link>
          <Link
            href="/upload"
            className={`text-button-md px-3 py-1.5 rounded-md transition-colors ${
              isUploadActive
                ? "bg-primary-deep text-on-primary"
                : "bg-primary text-on-primary hover:bg-primary-pressed"
            }`}
          >
            + 업로드
          </Link>
        </div>
      </header>

      {/* ── Desktop: left sidebar ── */}
      <aside className="hidden md:flex w-60 shrink-0 bg-surface border-r border-hairline flex-col h-screen sticky top-0 overflow-y-auto">
        {/* Logo */}
        <div className="px-4 py-3.5 border-b border-hairline">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-on-primary text-xs font-bold shrink-0">
              M
            </span>
            <span className="text-body-sm font-semibold text-ink truncate">
              meeting-notes-ai
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          <Link
            href="/"
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-body-sm transition-colors ${
              isJobsActive
                ? "bg-hairline text-ink font-medium"
                : "text-slate hover:bg-hairline-soft hover:text-ink"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
              <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
              <rect x="2" y="11" width="8" height="2" rx="0.5" fill="currentColor" />
            </svg>
            Jobs
          </Link>
        </nav>

        {/* Upload button */}
        <div className="px-3 py-4 border-t border-hairline">
          <Link
            href="/upload"
            className={`flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md text-button-md transition-colors ${
              isUploadActive
                ? "bg-primary-deep text-on-primary"
                : "bg-primary text-on-primary hover:bg-primary-pressed"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="1" x2="6" y2="11" />
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
            새 업로드
          </Link>
        </div>
      </aside>
    </>
  );
}
