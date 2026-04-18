import Link from "next/link";
import { Flame, Map, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-stroke-primary/40 bg-primary/15">
          <Flame className="h-7 w-7 text-primary" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          FireMapSim-v2
        </p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Scenario planning for wildfire simulation workflows
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Configure project boundaries, weather, ignitions, and fuel breaks, then run
          simulation workflows in a consistent map-first workspace.
        </p>

        <div className="mt-8 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <Map className="mb-2 h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Map-first setup</p>
            <p className="mt-1 text-xs text-muted-foreground">Set location, boundary, and terrain-driven context quickly.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <Sparkles className="mb-2 h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Agent-assisted inputs</p>
            <p className="mt-1 text-xs text-muted-foreground">Use guided actions and chat to streamline setup and execution.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <Flame className="mb-2 h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Replayable simulation runs</p>
            <p className="mt-1 text-xs text-muted-foreground">Run, review, and iterate with saved project configurations.</p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2">
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
