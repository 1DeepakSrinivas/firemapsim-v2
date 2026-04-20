export type DevsFireErrorType =
  | "ConnectionError"
  | "TimeoutError"
  | "SimulationError"
  | "ServerError"
  | "UnknownError";

export class DevsFireError extends Error {
  readonly type: DevsFireErrorType;
  readonly status?: number;
  readonly details?: string;
  readonly causeValue?: unknown;

  constructor(input: {
    type: DevsFireErrorType;
    message: string;
    details?: string;
    status?: number;
    causeValue?: unknown;
  }) {
    super(input.message);
    this.name = "DevsFireError";
    this.type = input.type;
    this.details = input.details;
    this.status = input.status;
    this.causeValue = input.causeValue;
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

export function classifyUnknownError(
  error: unknown,
  fallbackMessage = "Unknown DEVS-FIRE failure.",
): DevsFireError {
  if (error instanceof DevsFireError) {
    return error;
  }

  const message = toErrorMessage(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("abort")
  ) {
    return new DevsFireError({
      type: "TimeoutError",
      message: "DEVS-FIRE request timed out.",
      details: message,
      causeValue: error,
    });
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return new DevsFireError({
      type: "ConnectionError",
      message: "Unable to reach DEVS-FIRE upstream.",
      details: message,
      causeValue: error,
    });
  }

  return new DevsFireError({
    type: "UnknownError",
    message: fallbackMessage,
    details: message,
    causeValue: error,
  });
}

export function errorTypeToStatus(type: DevsFireErrorType): number {
  switch (type) {
    case "ConnectionError":
      return 502;
    case "TimeoutError":
      return 504;
    case "SimulationError":
      return 422;
    case "ServerError":
      return 502;
    case "UnknownError":
      return 500;
    default:
      return 500;
  }
}
