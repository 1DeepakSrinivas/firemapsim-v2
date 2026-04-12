export type PlanStep = {
  index: number;
  text: string;
};

export type PlanStepStatus = "pending" | "running" | "done" | "error";

export function parsePlanSteps(text: string): PlanStep[] {
  const startToken = "here's my plan:";
  const lower = text.toLowerCase();
  const startIndex = lower.indexOf(startToken);
  if (startIndex === -1) {
    return [];
  }

  const section = text.slice(startIndex + startToken.length);
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const steps: PlanStep[] = [];
  for (const line of lines) {
    const match = line.match(/^(\d+)[\.)]\s+(.+)$/);
    if (!match) {
      if (steps.length > 0) {
        break;
      }
      continue;
    }

    steps.push({
      index: Number(match[1]),
      text: match[2],
    });
  }

  return steps;
}

export function detectPlanStepStatus(stepText: string): PlanStepStatus {
  const t = stepText.toLowerCase();
  if (/(error|failed|failure)/.test(t)) {
    return "error";
  }
  if (/(done|complete|finished|ready)/.test(t)) {
    return "done";
  }
  if (/(running|in progress|processing|working)/.test(t)) {
    return "running";
  }
  return "pending";
}
