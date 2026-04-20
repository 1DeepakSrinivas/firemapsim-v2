import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      out.push(...walk(fullPath));
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

const violations = walk("src").filter((file) => /\.test\.(ts|tsx)$/.test(file));

if (violations.length > 0) {
  console.error("Test placement guard failed.");
  console.error("Move these co-located tests from src/ into __tests__/:");
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("Test placement guard passed.");
