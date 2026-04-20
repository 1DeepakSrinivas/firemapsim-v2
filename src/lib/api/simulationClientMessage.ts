export type SimulationRunErrorPayload = {
  code?: string;
  error?: string;
  details?: string;
  hint?: string;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function formatSimulationRunFailureMessage(
  status: number,
  payload: SimulationRunErrorPayload,
): string {
  const code = clean(payload.code);
  const error = clean(payload.error);
  const details = clean(payload.details);
  const hint = clean(payload.hint);

  const summary =
    error ??
    (code ? `Simulation failed with ${code}` : `Simulation failed (${status})`);

  if (hint) {
    return `${summary} (HTTP ${status}). Hint: ${hint}`;
  }

  if (details && details !== error) {
    return `${summary} (HTTP ${status}). ${details}`;
  }

  return `${summary} (HTTP ${status}).`;
}
