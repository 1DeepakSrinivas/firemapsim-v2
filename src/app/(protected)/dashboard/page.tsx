"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  Clock,
  Flame,
  LayoutGrid,
  Map,
  MapPin,
  Play,
  Search,
  Trash2,
  User,
} from "lucide-react";

import { computeUrlSlugFromClerk } from "@/lib/url-slug";

type ProjectRow = { id: string; title: string; updatedAt: string | null };

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();

  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch("/api/me/slug"),
        fetch("/api/projects"),
      ]);
      if (sRes.ok) {
        const s = (await sRes.json()) as { urlSlug?: string };
        setSlug(s.urlSlug ?? null);
      }
      if (pRes.ok) {
        const p = (await pRes.json()) as { projects?: ProjectRow[] };
        setProjects(p.projects ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) void load();
  }, [isLoaded, isSignedIn, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, query]);

  const pathSlug =
    slug ?? (user?.id ? computeUrlSlugFromClerk(user.username, user.id) : null);

  async function createProject() {
    setCreating(true);
    try {
      const res = await fetch("/api/project", { method: "POST" });
      const raw = await res.text();
      let body: { id?: string; urlSlug?: string; error?: string } = {};
      if (raw.trim()) {
        try {
          body = JSON.parse(raw) as typeof body;
        } catch {
          /* HTML or non-JSON error body */
        }
      }
      if (!res.ok || !body.id) return;
      const segment = body.urlSlug ?? pathSlug;
      if (!segment) return;
      router.push(`/${segment}/${body.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(projectId: string, title: string) {
    const confirmed = window.confirm(
      `Delete project \"${title}\"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingProjectId(projectId);
    try {
      const res = await fetch(`/api/project/${projectId}`, { method: "DELETE" });
      if (!res.ok) return;
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 bg-[#141414] px-3 sm:h-12 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/20 sm:h-7 sm:w-7 sm:rounded-lg">
            <Flame className="h-3.5 w-3.5 text-orange-400 sm:h-4 sm:w-4" />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-white/80 uppercase sm:text-xs">
            <span className="hidden sm:inline">FireMapSim-v2</span>
            <span className="sm:hidden">FMS-v2</span>
          </span>
        </div>

        <nav className="flex items-center gap-0.5 sm:gap-1">
          <span className="flex items-center gap-1 rounded-md bg-white/8 px-2 py-1 text-[10px] font-medium text-white/90 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs">
            <LayoutGrid className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Home
          </span>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={async () => {
              await clerk.signOut({ redirectUrl: "/login" });
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/5 hover:text-white/70 sm:h-7 sm:w-7"
            title={user?.primaryEmailAddress?.emailAddress}
          >
            <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Dashboard
            </h1>
            <p className="mt-1 text-xs text-white/40 sm:text-sm">
              {user?.firstName ? `Welcome back, ${user.firstName}.` : "Welcome back."}{" "}
              {loading ? "…" : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            disabled={creating || loading || !isSignedIn}
            onClick={() => void createProject()}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:py-2 sm:text-xs"
          >
            <Play className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            {creating ? "Creating…" : "New project"}
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 sm:mb-5 sm:py-2.5">
          <Search className="h-3 w-3 shrink-0 text-white/30 sm:h-3.5 sm:w-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects by name…"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-[10px] text-white/30 hover:text-white/60 sm:text-[11px]"
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-white/35">Loading projects…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-20 text-center">
            <Map className="mx-auto mb-3 h-8 w-8 text-white/15" />
            <p className="text-sm text-white/30">
              {projects.length === 0
                ? "No projects yet. Create one to open the map."
                : "No projects match your search."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/3 p-4 transition hover:border-white/15 hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-white/90 group-hover:text-white">
                    {p.title}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/50">
                      Map
                    </span>
                    <button
                      type="button"
                      disabled={deletingProjectId === p.id}
                      title="Delete project"
                      onClick={() => void deleteProject(p.id, p.title)}
                      className="rounded-md border border-red-500/25 bg-red-500/10 p-1 text-red-300/80 transition hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-[11px] text-white/40">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0 opacity-50" />
                    <span className="text-white/35">Workspace</span>
                  </div>
                  {p.updatedAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 shrink-0" />
                      {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>

                <Link
                  href={pathSlug ? `/${pathSlug}/${p.id}` : "#"}
                  className="mt-auto w-full rounded-lg border border-white/10 py-1.5 text-center text-[11px] text-white/50 transition group-hover:border-orange-500/30 group-hover:text-orange-400/90"
                >
                  Open project
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
