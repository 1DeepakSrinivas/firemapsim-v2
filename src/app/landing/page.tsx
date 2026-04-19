import Link from "next/link";
import type { Metadata } from "next";
import {
  Bot,
  BrainCircuit,
  Database,
  Flame,
  Layers3,
  Map,
  Satellite,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Wind,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Landing",
  description:
    "Overview of the FireMapSim-v2 workspace, including map-first setup, agentic assistance, and documentation access.",
};

const keyFeatures = [
  {
    title: "Map-first scenario setup",
    description:
      "Define project boundaries, ignitions, and fuel breaks inside a spatial workspace designed around wildfire planning tasks.",
    icon: Map,
  },
  {
    title: "Agent-assisted intake",
    description:
      "Use guided prompts and structured actions to populate weather, terrain, and simulation parameters with less manual overhead.",
    icon: Bot,
  },
  {
    title: "Replayable project runs",
    description:
      "Persist configurations and rerun scenarios so different assumptions can be compared in a consistent workflow.",
    icon: Flame,
  },
];

const techStack = [
  "Next.js 16 App Router",
  "React 19",
  "TypeScript",
  "Tailwind CSS v4",
  "Clerk authentication",
  "Leaflet + React Leaflet",
  "Mastra agents",
  "Vercel AI SDK",
  "Supabase",
];

const agenticFeatures = [
  {
    title: "Structured workflow guidance",
    description:
      "The agent helps gather inputs in a form that stays synchronized with the workspace rather than acting like a generic chat bot.",
    icon: BrainCircuit,
  },
  {
    title: "Execution-oriented orchestration",
    description:
      "Agent outputs are shaped to trigger simulation setup, delegate runs, and keep scenario state aligned with backend execution.",
    icon: Sparkles,
  },
  {
    title: "Context retention for iteration",
    description:
      "Conversation state and project context support repeated refinement as scenarios evolve across multiple runs.",
    icon: Database,
  },
];

const uiFeatures = [
  {
    title: "Minimal workspace presentation",
    description:
      "The interface emphasizes task clarity, readable state, and purposeful controls over product-style marketing treatment.",
    icon: ShieldCheck,
  },
  {
    title: "Layered map workspace",
    description:
      "Terrain, weather, and fire overlays are organized into a workspace model suited to geospatial analysis and simulation review.",
    icon: Layers3,
  },
  {
    title: "Responsive working surfaces",
    description:
      "Core navigation and summary panels are designed to remain usable across desktop review sessions and smaller laptop layouts.",
    icon: WandSparkles,
  },
];

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
        {description}
      </p>
    </div>
  );
}

function HeroMapMockup() {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-stroke-secondary/25 bg-card shadow-[0_28px_80px_-48px_rgba(20,24,40,0.55)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(33,94,97,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(26,50,99,0.12),transparent_42%)]" />
      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="relative min-h-[320px] border-b border-border/80 p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle,rgba(0,0,0,0.08)_1px,transparent_1px)] [background-size:26px_26px]" />
          <div className="relative flex items-center justify-between rounded-2xl border border-border/80 bg-background/88 px-4 py-3 backdrop-blur">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Workspace Preview
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                Scenario region · Northern California
              </p>
            </div>
            <span className="rounded-full border border-stroke-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              Public overview
            </span>
          </div>

          <div className="relative mt-5 h-[224px] overflow-hidden rounded-[1.6rem] border border-stroke-secondary/20 bg-[linear-gradient(160deg,rgba(16,23,36,0.96),rgba(28,39,61,0.92))] p-4 text-white">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="absolute left-6 top-10 h-28 w-36 rounded-full border border-emerald-200/25 bg-emerald-300/10 blur-2xl" />
            <div className="absolute bottom-8 right-10 h-24 w-24 rounded-full border border-orange-200/20 bg-orange-300/10 blur-xl" />

            <div className="relative h-full rounded-[1.2rem] border border-white/10 bg-black/10 p-4">
              <div className="absolute left-[16%] top-[18%] h-[38%] w-[44%] rounded-[38%_62%_55%_45%/47%_34%_66%_53%] border border-emerald-200/60 bg-emerald-300/10" />
              <div className="absolute left-[24%] top-[33%] h-[3px] w-[32%] rotate-[12deg] rounded-full bg-orange-300/90 shadow-[0_0_22px_rgba(251,146,60,0.6)]" />
              <div className="absolute left-[49%] top-[48%] h-3 w-3 rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.9)]" />
              <div className="absolute left-[57%] top-[54%] h-3 w-3 rounded-full bg-red-300 shadow-[0_0_14px_rgba(252,165,165,0.8)]" />
              <div className="absolute right-[10%] top-[16%] rounded-full border border-white/12 bg-white/8 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-white/80">
                Satellite
              </div>

              <div className="absolute bottom-4 left-4 flex gap-2 text-[10px] uppercase tracking-[0.18em] text-white/75">
                <span className="rounded-full border border-white/12 bg-white/8 px-2 py-1">Boundary</span>
                <span className="rounded-full border border-white/12 bg-white/8 px-2 py-1">Ignition</span>
                <span className="rounded-full border border-white/12 bg-white/8 px-2 py-1">Fuel break</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-2xl border border-border/80 bg-background/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Inputs
            </p>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-border/80 bg-card px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Wind className="h-4 w-4 text-primary" />
                  Weather conditions
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Wind, humidity, and temperature prepared for scenario review.
                </p>
              </div>
              <div className="rounded-xl border border-border/80 bg-card px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Satellite className="h-4 w-4 text-primary" />
                  Terrain and layers
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Map overlays organize terrain context and fire spread interpretation.
                </p>
              </div>
              <div className="rounded-xl border border-border/80 bg-card px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Bot className="h-4 w-4 text-primary" />
                  Agent guidance
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Chat-assisted setup reduces friction in simulation preparation.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-stroke-primary/20 bg-primary/8 p-4">
            <p className="text-sm font-medium text-foreground">Minimal by design.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Signed-out visitors can review the project overview here, then authenticate
              to continue into the protected dashboard and workspace flow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPageView() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border/70">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-stroke-primary/30 bg-primary/10">
                <Flame className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground sm:text-base">FireMapSim-v2</p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link href="/docs">Documentation</Link>
              </Button>
              <Button asChild>
                <Link href="/login">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Wildfire simulation workspace
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              FireMapSim-v2
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
              A minimal interface for configuring wildfire scenarios, reviewing spatial
              context, and moving from login to dashboard to simulation workflow without
              unnecessary product framing.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-xl px-6">
                <Link href="/login">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl px-6">
                <Link href="/docs">Documentation</Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {keyFeatures.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border/80 bg-card/70 p-4"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <HeroMapMockup />
        </div>
      </section>

      <section className="border-t border-border/70 bg-card/35">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8">
          <SectionHeader
            eyebrow="Key features"
            title="A concise interface for wildfire scenario preparation"
            description="The first content section expands the primary capabilities one by one, with the emphasis on task flow rather than feature marketing."
          />
          <div className="mt-10 grid gap-4">
            {keyFeatures.map(({ icon: Icon, title, description }, index) => (
              <div
                key={title}
                className="grid gap-4 rounded-3xl border border-border/80 bg-background/90 p-5 sm:grid-cols-[72px_1fr] sm:items-start sm:p-6"
              >
                <div className="flex items-center gap-3 sm:block">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-stroke-primary/25 bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-medium tracking-tight text-foreground">{title}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/70">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8">
          <SectionHeader
            eyebrow="Tech stack"
            title="Implemented with the stack already present in the project"
            description="This section stays factual and brief, naming the core technologies that support authentication, mapping, agents, and persistence."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            {techStack.map((item) => (
              <span
                key={item}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 bg-card/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8">
          <SectionHeader
            eyebrow="Agentic features"
            title="AI assistance is presented as workflow support"
            description="This section reflects the current system: structured assistance for configuration, synchronization with the workspace, and orchestration of simulation actions."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {agenticFeatures.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-3xl border border-border/80 bg-background/90 p-6">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-stroke-primary/25 bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-4 text-lg font-medium tracking-tight text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/70">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8">
          <SectionHeader
            eyebrow="UI features"
            title="The interface is designed around map interaction and review"
            description="This section highlights the user-facing qualities of the workspace itself: layered context, low-friction controls, and a presentation style suited to research and operations."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {uiFeatures.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-3xl border border-border/80 bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stroke-primary/25 bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <h3 className="text-base font-medium tracking-tight text-foreground">{title}</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70 bg-card/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">FireMapSim-v2</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed-out users can review this overview page, then authenticate to access
              the protected dashboard and project workspaces.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost">
              <Link href="/docs">Documentation</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/landing">Landing</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Get started</Link>
            </Button>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default function LandingPage() {
  return <LandingPageView />;
}
