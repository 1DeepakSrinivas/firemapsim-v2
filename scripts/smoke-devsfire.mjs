#!/usr/bin/env node
/**
 * Optional local smoke: `node scripts/smoke-devsfire.mjs http://localhost:3000`
 * Requires dev server + Clerk session cookie for protected /api/devs-fire, or call without auth if you temporarily open the route.
 */
const base = process.argv[2] ?? "http://localhost:3000";

async function main() {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/devs-fire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "/connectToServer",
      body: "connect",
      headers: { "Content-Type": "text/plain" },
    }),
  });
  const json = await res.json().catch(() => ({}));
  console.log("status", res.status, JSON.stringify(json).slice(0, 200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
