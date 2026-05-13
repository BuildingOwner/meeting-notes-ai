import Link from "next/link";

// global-nav (ultra-thin black bar, Apple style)
export function Nav() {
  return (
    <nav className="bg-black text-canvas h-11 flex items-center px-8">
      <Link href="/" className="text-fine font-text mr-8 tracking-tight">
        meeting-notes-ai
      </Link>
      <div className="flex items-center gap-6 text-fine">
        <Link href="/" className="hover:opacity-80">
          잡 목록
        </Link>
        <Link href="/upload" className="hover:opacity-80">
          업로드
        </Link>
      </div>
    </nav>
  );
}
