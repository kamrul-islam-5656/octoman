import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { TestResult } from "@/types";

import { connectToDatabase } from "@/lib/db/connect";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { executeScript } from "@/lib/scripting/pm-api";
import {
  apiError,
  apiException,
  headersToRecord,
  normalizeHeaders,
  parseObjectId,
  readJsonBody,
  toErrorMessage,
} from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import {
  HTTP_METHOD_VALUES,
  REQUEST_BODY_MODE_VALUES,
  createDefaultAuthConfig,
  keyValueSchema,
  normalizeAuthConfig,
  normalizeBodyForm,
  normalizeBodyMode,
  requestAuthSchema,
} from "@/lib/server/request-contract";
import {
  interpolateHeaders,
  interpolateKeyValuePairs,
  interpolateString,
  variablesToMap,
} from "@/lib/server/interpolate";

export const runtime = "nodejs";

const executeSchema = z.object({
  requestId: z.string().trim().optional().nullable(),
  collectionId: z.string().trim().optional().nullable(),
  folderId: z.string().trim().optional().nullable(),
  environmentId: z.string().trim().optional().nullable(),
  method: z.enum(HTTP_METHOD_VALUES),
  url: z.string().trim().min(1).max(3000),
  headers: z.array(keyValueSchema).default([]),
  bodyMode: z.enum(REQUEST_BODY_MODE_VALUES).optional(),
  bodyRaw: z.string().max(500000).optional(),
  bodyForm: z.array(keyValueSchema).optional(),
  body: z.string().max(500000).optional(),
  auth: requestAuthSchema.optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  pre_request_script: z.string().max(100000).optional(),
  test_script: z.string().max(100000).optional(),
});

function toResponseHeaders(headers: Headers): { key: string; value: string }[] {
  const pairs: { key: string; value: string }[] = [];
  headers.forEach((value, key) => {
    pairs.push({ key, value });
  });
  // Ensure individual set-cookie headers are captured (forEach may merge them)
  try {
    const setCookies = headers.getSetCookie?.();
    if (setCookies && setCookies.length > 0) {
      // Remove any merged set-cookie entry from forEach
      const filtered = pairs.filter((p) => p.key.toLowerCase() !== "set-cookie");
      for (const cookie of setCookies) {
        filtered.push({ key: "set-cookie", value: cookie });
      }
      return filtered;
    }
  } catch { /* getSetCookie not available */ }
  return pairs;
}

function maybeTruncate(value: unknown): unknown {
  if (typeof value === "string") {
    return value.slice(0, 100000);
  }

  return value;
}

function classifyExecutionError(error: unknown): {
  code: string;
  message: string;
} {
  const message = toErrorMessage(error);
  const normalized = message.toLowerCase();
  const name = error instanceof Error ? error.name.toLowerCase() : "";

  if (name === "aborterror" || normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("etimedout") || normalized.includes("und_err_connect_timeout")) {
    return {
      code: "EXTERNAL_TIMEOUT",
      message: "Request timed out before a response was received.",
    };
  }

  if (normalized.includes("enotfound") || normalized.includes("dns") || normalized.includes("getaddrinfo") || normalized.includes("querysrv")) {
    return {
      code: "EXTERNAL_DNS_ERROR",
      message: "DNS resolution failed while trying to reach the target host.",
    };
  }

  if (normalized.includes("econnrefused") || normalized.includes("connection refused")) {
    return {
      code: "EXTERNAL_CONNECTION_REFUSED",
      message: "Connection was refused by the target server.",
    };
  }

  if (normalized.includes("tls") || normalized.includes("ssl") || normalized.includes("certificate") || normalized.includes("self-signed")) {
    return {
      code: "EXTERNAL_TLS_ERROR",
      message: "TLS/SSL handshake failed for the target server.",
    };
  }

  if (name === "aborterror" || normalized.includes("aborted")) {
    return {
      code: "EXTERNAL_ABORTED",
      message: "Request was aborted before completion.",
    };
  }

  return {
    code: "EXTERNAL_NETWORK_ERROR",
    message,
  };
}

function dropContentType(headersRecord: Record<string, string>): Record<string, string> {
  const nextHeaders: Record<string, string> = {};

  Object.entries(headersRecord).forEach(([key, value]) => {
    if (key.toLowerCase() === "content-type") {
      return;
    }

    nextHeaders[key] = value;
  });

  return nextHeaders;
}

function applyAuthToRequest(
  auth: ReturnType<typeof normalizeAuthConfig>,
  parsedUrl: URL,
  headersRecord: Record<string, string>,
  variableMap: Record<string, string>,
): Record<string, string> {
  const nextHeaders = { ...headersRecord };

  if (auth.type === "basic") {
    const username = interpolateString(auth.basic.username, variableMap);
    const password = interpolateString(auth.basic.password, variableMap);

    if (username || password) {
      const token = Buffer.from(`${username}:${password}`).toString("base64");
      nextHeaders.Authorization = `Basic ${token}`;
    }
  }

  if (auth.type === "bearer") {
    const token = interpolateString(auth.bearerToken, variableMap);
    if (token) {
      nextHeaders.Authorization = `Bearer ${token}`;
    }
  }

  if (auth.type === "api-key") {
    const key = interpolateString(auth.apiKey.key, variableMap).trim();
    const value = interpolateString(auth.apiKey.value, variableMap);

    if (key) {
      if (auth.apiKey.addTo === "query") {
        parsedUrl.searchParams.set(key, value);
      } else {
        nextHeaders[key] = value;
      }
    }
  }

  return nextHeaders;
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = executeSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid execution payload.", 422);
    }

    await connectToDatabase();

    const environmentId = parseObjectId(parsed.data.environmentId ?? null);
    const requestId = parseObjectId(parsed.data.requestId ?? null);
    const collectionId = parseObjectId(parsed.data.collectionId ?? null);
    const folderId = parseObjectId(parsed.data.folderId ?? null);

    let environmentName: string | null = null;
    let variableMap: Record<string, string> = {};

    if (environmentId) {
      const environment = await EnvironmentModel.findOne({
        _id: environmentId.toString(),
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
      }).lean();

      if (!environment) {
        return apiError("Selected environment was not found.", 404);
      }

      environmentName = environment.name;
      variableMap = variablesToMap(environment.variables);
    }

    const normalizedHeaders = normalizeHeaders(parsed.data.headers);
    const interpolatedHeaders = interpolateHeaders(normalizedHeaders, variableMap);
    const interpolatedBodyForm = interpolateKeyValuePairs(
      normalizeBodyForm(parsed.data.bodyForm),
      variableMap,
    );
    const authConfig = normalizeAuthConfig(parsed.data.auth ?? createDefaultAuthConfig());

    const interpolatedUrl = interpolateString(parsed.data.url, variableMap);
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(interpolatedUrl);
    } catch {
      return apiError("URL is invalid after environment interpolation.", 422);
    }

    let headersRecord = headersToRecord(interpolatedHeaders);
    headersRecord = applyAuthToRequest(authConfig, parsedUrl, headersRecord, variableMap);

    const bodyMode = normalizeBodyMode(parsed.data.bodyMode, parsed.data.method);
    const rawBody = interpolateString(parsed.data.bodyRaw ?? parsed.data.body ?? "", variableMap);

    let bodyToSend: BodyInit | undefined;
    let persistedBodyRaw = "";
    let persistedBodyForm = [] as { key: string; value: string; enabled?: boolean }[];

    if (bodyMode === "raw") {
      persistedBodyRaw = rawBody;

      if (rawBody.trim().length > 0) {
        const contentTypeCandidate = Object.entries(headersRecord).find(
          ([key]) => key.toLowerCase() === "content-type",
        )?.[1] ?? "application/json";

        if (contentTypeCandidate.toLowerCase().includes("application/json")) {
          try {
            const jsonBody = JSON.parse(rawBody);
            bodyToSend = JSON.stringify(jsonBody);
          } catch {
            return apiError("JSON body is invalid.", 422);
          }
        } else {
          bodyToSend = rawBody;
        }
      }
    }

    if (bodyMode === "x-www-form-urlencoded") {
      const formPairs = interpolatedBodyForm.filter((item) => item.enabled !== false);
      const params = new URLSearchParams();

      formPairs.forEach((item) => {
        params.append(item.key, item.value);
      });

      bodyToSend = params;
      persistedBodyForm = formPairs;

      if (!Object.keys(headersRecord).some((key) => key.toLowerCase() === "content-type")) {
        headersRecord["Content-Type"] = "application/x-www-form-urlencoded";
      }
    }

    if (bodyMode === "form-data") {
      const formPairs = interpolatedBodyForm.filter((item) => item.enabled !== false);
      const formData = new FormData();

      formPairs.forEach((item) => {
        formData.append(item.key, item.value);
      });

      bodyToSend = formData;
      persistedBodyForm = formPairs;
      headersRecord = dropContentType(headersRecord);
    }

    const timeoutMs = parsed.data.timeoutMs ?? 30000;
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    const startedAt = Date.now();

    let responseStatus: number | null = null;
    let responseHeaders: { key: string; value: string }[] = [];
    let responseBody: unknown = null;
    let responseError: string | null = null;
    let responseErrorCode: string | null = null;

    try {
      const response = await fetch(parsedUrl.toString(), {
        method: parsed.data.method,
        headers: headersRecord,
        body: bodyToSend,
        cache: "no-store",
        signal: abortController.signal,
      });

      responseStatus = response.status;
      responseHeaders = toResponseHeaders(response.headers);

      const textPayload = await response.text();
      const responseContentType = response.headers.get("content-type") ?? "";

      if (responseContentType.toLowerCase().includes("application/json")) {
        try {
          responseBody = JSON.parse(textPayload);
        } catch {
          responseBody = textPayload;
          responseErrorCode = "EXTERNAL_RESPONSE_PARSE_ERROR";
        }
      } else {
        responseBody = textPayload;
      }
    } catch (error) {
      const classified = classifyExecutionError(error);
      responseError = classified.message;
      responseErrorCode = classified.code;
    } finally {
      clearTimeout(timeoutHandle);
    }

    const durationMs = Date.now() - startedAt;

    // Execute test script if provided
    let testResults: TestResult[] = [];
    const testScript = parsed.data.test_script ?? "";
    if (testScript.trim() && responseStatus !== null) {
      const bodyStr = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody ?? "");
      const scriptResult = executeScript(testScript, {
        response: {
          status: responseStatus,
          statusText: "",
          headers: responseHeaders,
          body: bodyStr,
          durationMs,
        },
        envVariables: variableMap,
      });
      testResults = scriptResult;
    }

    const historyDoc = await RequestHistoryModel.create({
      _id: new Types.ObjectId(),
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
      user_id: new Types.ObjectId(context.userId),
      collection_id: collectionId,
      folder_id: folderId,
      request_id: requestId,
      method: parsed.data.method,
      url: parsedUrl.toString(),
      headers: interpolatedHeaders,
      body_mode: bodyMode,
      body_raw: persistedBodyRaw,
      body_form: persistedBodyForm,
      auth: authConfig,
      body: persistedBodyRaw,
      environment_name: environmentName,
      response_status: responseStatus,
      response_headers: responseHeaders,
      response_body: maybeTruncate(responseBody),
      duration_ms: durationMs,
      error_code: responseErrorCode,
      error: responseError,
      test_results: testResults,
    });

    if (requestId) {
      await SavedRequestModel.updateOne(
        {
          _id: requestId,
          tenant_id: context.tenantId,
          workspace_id: context.workspaceId,
        },
        {
          $set: { last_used_at: new Date() },
        },
      );
    }

    if (responseError) {
      return NextResponse.json(
        {
          ok: false,
          status: 0,
          headers: [],
          body: null,
          durationMs,
          historyId: historyDoc._id.toString(),
          errorCode: responseErrorCode,
          error: responseError,
          testResults: [],
          timing: null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: responseStatus ? responseStatus < 400 : false,
      status: responseStatus,
      headers: responseHeaders,
      body: responseBody,
      durationMs,
      historyId: historyDoc._id.toString(),
      errorCode: responseErrorCode,
      error: null,
      testResults,
      timing: null,
    });
  } catch (error) {
    return apiException(error);
  }
}
