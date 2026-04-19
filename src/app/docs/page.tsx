import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Documentation entry point for the FireMapSim-v2 wildfire simulation research workspace.",
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-border bg-card/80 p-8 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Documentation
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">FireMapSim-v2 docs</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          This route is the documentation entry point for the project. A fuller set of
          research notes and implementation references can be expanded here in a
          follow-up pass.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/80 p-5">
            <h2 className="text-sm font-medium text-foreground">What this project covers</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Wildfire simulation setup, geospatial workspace interaction, agent-assisted
              scenario intake, and replayable project runs.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/80 p-5">
            <h2 className="text-sm font-medium text-foreground">Current status</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This page is intentionally minimal for now, but it already serves as the
              internal destination for landing-page documentation links.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login">Get started</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to landing page</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
