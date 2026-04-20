import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/70 bg-card/40">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">FireMapSim-v2</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Link href="/" className="transition hover:text-foreground">
            Home
          </Link>
          <Link href="/docs" className="transition hover:text-foreground">
            Docs
          </Link>
          <Link href="/dashboard" className="transition hover:text-foreground">
            Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}
