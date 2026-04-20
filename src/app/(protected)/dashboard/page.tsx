"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  BookOpen,
  Check,
  Clock,
  Loader2,
  Map,
  MapPin,
  Pencil,
  Play,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { computeUrlSlugFromClerk } from "@/lib/url-slug";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { LogoMarkIcon } from "@/components/brand/LogoMarkIcon";
import { Footer } from "@/components/layout/Footer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProjectRow = { id: string; title: string; updatedAt: string | null };

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useUser();

  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);

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
      if (!res.ok || !body.id) {
        toast.error(body.error ?? "Failed to create project");
        return;
      }
      const segment = body.urlSlug ?? pathSlug;
      if (!segment) {
        toast.error("Project created but user slug is unavailable");
        return;
      }
      toast.success("Project created");
      router.push(`/${segment}/${body.id}`);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function executeDeleteProject(projectId: string) {
    setDeletingProjectId(projectId);
    try {
      const res = await fetch(`/api/project/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(payload.error ?? "Failed to delete project");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      toast.success("Project deleted");
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeletingProjectId(null);
    }
  }

  function startProjectRename(project: ProjectRow) {
    setEditingProjectId(project.id);
    setRenameDraft(project.title);
  }

  function cancelProjectRename() {
    setEditingProjectId(null);
    setRenameDraft("");
  }

  async function saveProjectRename(project: ProjectRow) {
    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      toast.error("Project name cannot be empty");
      return;
    }
    if (nextTitle === project.title) {
      cancelProjectRename();
      return;
    }

    setRenamingProjectId(project.id);
    try {
      const res = await fetch(`/api/project/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(payload.error ?? "Failed to rename project");
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as {
        title?: string;
        updatedAt?: string | null;
      };
      setProjects((prev) =>
        prev.map((entry) =>
          entry.id === project.id
            ? {
                ...entry,
                title: payload.title ?? nextTitle,
                updatedAt: payload.updatedAt ?? entry.updatedAt,
              }
            : entry,
        ),
      );
      cancelProjectRename();
      toast.success("Project renamed");
    } catch {
      toast.error("Failed to rename project");
    } finally {
      setRenamingProjectId(null);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-stroke-secondary/40 bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex h-10 w-full max-w-5xl items-center justify-between px-4 sm:h-12 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-stroke-primary/45 bg-primary/15 sm:h-7 sm:w-7 sm:rounded-lg">
              <LogoMarkIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" alt="FireMapSim-v2" />
            </div>
            <span className="text-[10px] font-bold tracking-widest text-foreground/80 uppercase sm:text-xs">
              <span className="hidden sm:inline">FireMapSim-v2</span>
              <span className="sm:hidden">FMS-v2</span>
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-6 w-6 sm:h-7 sm:w-7",
                },
              }}
            />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Dashboard
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {user?.firstName ? `Welcome back, ${user.firstName}.` : "Welcome back."}{" "}
              {loading ? "…" : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button
            disabled={creating || loading || !isSignedIn}
            onClick={() => void createProject()}
            className="h-auto rounded-lg px-3 py-1.5 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-xs"
          >
            <Play className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            {creating ? "Creating…" : "New project"}
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-2 sm:mb-5 sm:py-2.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects by name…"
            className="h-auto flex-1 border-0 bg-transparent px-2 py-1 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm"
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuery("")}
              className="h-auto px-1 text-[10px] text-muted-foreground sm:text-[11px]"
            >
              Clear
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-16 text-center sm:px-6 sm:py-20">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full border border-border bg-muted sm:mb-4 sm:size-12">
              <Map className="h-5 w-5 text-muted-foreground/70 sm:h-6 sm:w-6" />
            </div>
            <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {projects.length === 0 ? "No projects yet" : "No matching projects"}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {projects.length === 0
                ? "Create your first project to open the workspace and run your first simulation."
                : "Try changing your search query or clear filters to see all projects."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {projects.length === 0 ? (
                <Button
                  onClick={() => void createProject()}
                  disabled={creating || loading || !isSignedIn}
                  className="rounded-lg px-3 py-1.5 text-xs"
                >
                  {creating ? "Creating…" : "Create project"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setQuery("")}
                  className="rounded-lg px-3 py-1.5 text-xs"
                >
                  Clear search
                </Button>
              )}
              <Button asChild variant="ghost" className="rounded-lg px-3 py-1.5 text-xs">
                <Link href="/landing">
                  <BookOpen className="h-3.5 w-3.5" />
                  Learn more
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-accent/35"
              >
                <div className="flex items-start justify-between gap-2">
                  {editingProjectId === p.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <Input
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveProjectRename(p);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelProjectRename();
                          }
                        }}
                        className="h-7 px-2 text-xs"
                        disabled={renamingProjectId === p.id}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => void saveProjectRename(p)}
                        disabled={renamingProjectId === p.id || !renameDraft.trim()}
                        title="Save project name"
                      >
                        {renamingProjectId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={cancelProjectRename}
                        disabled={renamingProjectId === p.id}
                        title="Cancel rename"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-foreground">
                      {p.title}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Map
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={renamingProjectId === p.id}
                      title="Rename project"
                      onClick={() => startProjectRename(p)}
                      className="size-6 rounded-md p-1"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      disabled={deletingProjectId === p.id || renamingProjectId === p.id}
                      title="Delete project"
                      onClick={() => setPendingDelete({ id: p.id, title: p.title })}
                      className="size-7 rounded-md border border-red-500/25 bg-red-500/10 p-1 text-red-300/80 hover:bg-red-500/20 hover:text-red-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0 opacity-50" />
                    <span>Workspace</span>
                  </div>
                  {p.updatedAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 shrink-0" />
                      {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>

                <Button
                  asChild
                  variant="outline"
                  className="mt-auto h-auto w-full rounded-lg border-stroke-secondary/35 py-1.5 text-[11px] text-muted-foreground group-hover:border-stroke-primary/40 group-hover:text-primary"
                >
                  <Link href={pathSlug ? `/${pathSlug}/${p.id}` : "#"}>Open project</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open: boolean) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="themed-layer">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title
                ? `This will permanently delete "${pendingDelete.title}". This cannot be undone.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingDelete || deletingProjectId === pendingDelete.id}
              onClick={() => {
                if (!pendingDelete) return;
                void executeDeleteProject(pendingDelete.id).finally(() => {
                  setPendingDelete(null);
                });
              }}
            >
              {pendingDelete && deletingProjectId === pendingDelete.id
                ? "Deleting..."
                : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Footer />
    </main>
  );
}
