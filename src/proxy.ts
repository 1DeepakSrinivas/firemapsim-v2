import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/simulations(.*)",
  "/api/agent(.*)",
  "/api/project(.*)",
  "/api/projects(.*)",
  "/api/me(.*)",
  "/api/simulation(.*)",
  "/api/devs-fire(.*)",
  "/api/weather(.*)",
]);

function isProjectWorkspacePath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  const projectId = parts[1]!;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    projectId,
  );
}

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  if (isProtectedRoute(req) || isProjectWorkspacePath(pathname)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
