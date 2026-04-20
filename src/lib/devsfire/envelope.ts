import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  classifyUnknownError,
  DevsFireError,
  type DevsFireErrorType,
  errorTypeToStatus,
} from "@/lib/devsfire/errors";

export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiError = {
  type: DevsFireErrorType;
  message: string;
  details?: string;
};

export type ApiSuccessEnvelope<T> = {
  ok: true;
  data: T;
  error: null;
  meta: ApiMeta;
};

export type ApiErrorEnvelope = {
  ok: false;
  data: null;
  error: ApiError;
  meta: ApiMeta;
};

function resolveRequestId(request?: Request): string {
  return request?.headers.get("x-request-id") ?? randomUUID();
}

function buildMeta(request?: Request): ApiMeta {
  return {
    requestId: resolveRequestId(request),
    timestamp: new Date().toISOString(),
  };
}

export function successEnvelope<T>(request: Request | undefined, data: T) {
  const body: ApiSuccessEnvelope<T> = {
    ok: true,
    data,
    error: null,
    meta: buildMeta(request),
  };
  return NextResponse.json(body, { status: 200 });
}

export function errorEnvelope(
  request: Request | undefined,
  error: unknown,
  statusOverride?: number,
) {
  const typed = error instanceof DevsFireError ? error : classifyUnknownError(error);
  const status = statusOverride ?? typed.status ?? errorTypeToStatus(typed.type);
  const body: ApiErrorEnvelope = {
    ok: false,
    data: null,
    error: {
      type: typed.type,
      message: typed.message,
      ...(typed.details ? { details: typed.details } : {}),
    },
    meta: buildMeta(request),
  };
  return NextResponse.json(body, { status });
}
