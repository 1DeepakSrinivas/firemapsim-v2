import { spawn } from "node:child_process";

const processes = [];

function startProcess(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[dev] ${name} exited with ${reason}`);
    shutdown();
    process.exit(typeof code === "number" ? code : 0);
  });

  processes.push(child);
}

function shutdown() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

console.log("[dev] Starting Next.js and Mastra dev servers...");
console.log("[dev] Next.js: http://localhost:3000");
console.log("[dev] Mastra Studio: http://localhost:4111");
console.log("[dev] Mastra API: http://localhost:4111/api");

startProcess("next", "bun", ["x", "next", "dev"]);
startProcess("mastra", "bunx", ["mastra", "dev"]);
