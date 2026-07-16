import { NextResponse } from "next/server";
import { Types } from "mongoose";

export class ApiHttpError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function apiException(error: unknown): NextResponse {
  console.error("API Exception:", error);

  if (error instanceof ApiHttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function parseObjectId(value: string | null): Types.ObjectId | null {
  if (!value || !Types.ObjectId.isValid(value)) {
    return null;
  }

  return new Types.ObjectId(value);
}

export function normalizeHeaders(
  headers: { key: string; value: string; enabled?: boolean }[] | undefined,
): { key: string; value: string; enabled: boolean }[] {
  if (!headers) {
    return [];
  }

  return headers
    .map((header) => ({
      key: header.key.trim(),
      value: header.value,
      enabled: header.enabled ?? true,
    }))
    .filter((header) => header.key.length > 0);
}

export function headersToRecord(
  headers: { key: string; value: string; enabled?: boolean }[],
): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (header.enabled === false || !header.key.trim()) {
      return acc;
    }

    acc[header.key.trim()] = header.value;
    return acc;
  }, {});
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    console.error("Failed to parse JSON body:", error);
    return null;
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}
