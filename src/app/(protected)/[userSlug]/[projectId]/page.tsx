import { notFound } from "next/navigation";

import { ProjectWorkspace } from "@/components/map/ProjectWorkspace";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ userSlug: string; projectId: string }>;
}) {
  const { projectId, userSlug } = await params;
  if (!UUID_RE.test(projectId)) notFound();
  return <ProjectWorkspace projectId={projectId} userSlug={decodeURIComponent(userSlug)} />;
}
