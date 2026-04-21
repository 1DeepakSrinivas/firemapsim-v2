import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  Bot,
  BrainCircuit,
  Database,
  Layers3,
  Map,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { GitHubIcon } from "nextra/icons";

import { Button } from "@/components/ui/button";
import { LogoMarkIcon } from "@/components/brand/LogoMarkIcon";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";

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
    icon: LogoMarkIcon,
  },
];

type TechStackIcon = { src: string; label: string };

const techStackGroups: { title: string; description: string; items: TechStackIcon[] }[] = [
  {
    title: "Full Stack",
    description:
      "Languages, runtime, UI framework, docs, auth, maps, persistence, and agent wiring used by the app.",
    items: [
      { src: "/icons/typescript.svg", label: "TypeScript" },
      { src: "/icons/bun.svg", label: "Bun" },
      { src: "/icons/react.svg", label: "React" },
      { src: "/icons/nextjs.svg", label: "Next.js" },
      { src: "/icons/nextra.svg", label: "Nextra" },
      { src: "/icons/tailwind.svg", label: "Tailwind CSS" },
      { src: "/icons/clerk.svg", label: "Clerk" },
      { src: "/icons/leaflet.svg", label: "Leaflet" },
      { src: "/icons/postgresql.svg", label: "PostgreSQL" },
      { src: "/icons/python.svg", label: "Python" },
      { src: "/icons/mastra.svg", label: "Mastra" },
      { src: "/icons/mcp.svg", label: "MCP" },
      { src: "/icons/fastmcp.svg", label: "FastMCP" },
    ],
  },
  {
    title: "AI and Dev Tools",
    description: "Model providers, coding assistants, and the editor environment used for development.",
    items: [
      { src: "/icons/claude.svg", label: "Claude" },
      { src: "/icons/claudecode.svg", label: "Claude Code" },
      { src: "/icons/qwen.svg", label: "Qwen" },
      { src: "/icons/cursor.svg", label: "Cursor" },
    ],
  },
  {
    title: "Cloud and Hosting",
    description: "Inference routing and deployment targets for the production app.",
    items: [
      { src: "/icons/openrouter.svg", label: "OpenRouter" },
      { src: "/icons/vercel.svg", label: "Vercel" },
    ],
  },
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
    <div className="h-full overflow-hidden rounded-[2rem] border border-stroke-secondary/25 bg-card shadow-[0_28px_80px_-48px_rgba(20,24,40,0.55)]">
      <Image
        src="/images/ui-project.png"
        alt="Workspace Preview"
        width={3024}
        height={1536}
        className="h-full w-auto object-contain"
        priority
      />
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
                <LogoMarkIcon className="h-5 w-5" alt="FireMapSim-v2" />
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
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
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
              {keyFeatures.map(({ icon: Icon, title }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border/80 bg-card/70 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">{title}</p>
                  </div>
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
                className="grid gap-4 rounded-3xl border border-border/80 bg-background/90 p-5 sm:grid-cols-[88px_minmax(0,1fr)] sm:items-start sm:p-6"
              >
                <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:pt-1">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-stroke-primary/25 bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <span className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground tabular-nums">
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
          <div className="mt-10 space-y-10">
            {techStackGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-base font-semibold tracking-tight text-foreground">{group.title}</h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{group.description}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {group.items.map(({ src, label }) => (
                    <div
                      key={src}
                      className="flex items-center gap-3 rounded-2xl border border-muted-foreground/20 bg-muted px-3 py-3 shadow-sm dark:border-muted-foreground/35"
                    >
                      <Image
                        src={src}
                        alt={`${label} icon`}
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 object-contain"
                      />
                      <p className="min-w-0 text-sm font-medium leading-tight text-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
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
        <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">FireMapSim-v2</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="ghost">
                <Link href="/docs">Documentation</Link>
              </Button>
              <Button asChild variant="outline">
                <a
                  href="https://github.com/1DeepakSrinivas/firemapsim-v2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <GitHubIcon height={16} width={16} />
                  GitHub
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href="https://sims.cs.gsu.edu/sims/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Devs-Fire-API
                </a>
              </Button>
              <Button asChild>
                <Link href="/login">Get started</Link>
              </Button>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            designed and developed by{" "}
            <a
              href="https://1deepaksrinivas.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              deepak
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function LandingPage() {
  return <LandingPageView />;
}
