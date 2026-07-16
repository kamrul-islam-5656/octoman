import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { TestResult } from "@/types";

import { connectToDatabase } from "@/lib/db/connect";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { executeScript } from "@/lib/scripting/pm-api";
import { apiError, apiException, parseObjectId, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import {
  HTTP_METHOD_VALUES,
  REQUEST_BODY_MODE_VALUES,
  keyValueSchema,
  normalizeAuthConfig,
  requestAuthSchema,
} from "@/lib/server/request-contract";

export const runtime = "nodejs";

/**
 * Persists the outcome of a request that was executed directly in the user's
 * browser (because it targeted localhost/a private network the server can't
 * reach). No network call happens here — this only records history and runs
 * the test script, mirroring what /api/tester/execute does after its own fetch.
 */
const recordSchema = z.object({
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
  auth: requestAuthSchema.optional(),
  test_script: z.string().max(100000).optional(),
  envVariables: z.record(z.string(), z.string()).optional(),
  outcome: z.object({
    status: z.number().nullable(),
    headers: z.array(keyValueSchema.omit({ enabled: true })).default([]),
    body: z.unknown().nullable(),
    durationMs: z.number(),
    errorCode: z.string().nullable(),
    error: z.string().nullable(),
  }),
});

function maybeTruncate(value: unknown): unknown {
  if (typeof value === "string") {
    return value.slice(0, 100000);
  }
  return value;
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = recordSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid execution record payload.", 422);
    }

    await connectToDatabase();

    const environmentId = parseObjectId(parsed.data.environmentId ?? null);
    const requestId = parseObjectId(parsed.data.requestId ?? null);
    const collectionId = parseObjectId(parsed.data.collectionId ?? null);
    const folderId = parseObjectId(parsed.data.folderId ?? null);
    const authConfig = normalizeAuthConfig(parsed.data.auth ?? { type: "none" });

    let environmentName: string | null = null;
    if (environmentId) {
      const environment = await EnvironmentModel.findOne({
        _id: environmentId.toString(),
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
      }).lean();
      environmentName = environment?.name ?? null;
    }

    const { outcome } = parsed.data;

    let testResults: TestResult[] = [];
    const testScript = parsed.data.test_script ?? "";
    if (testScript.trim() && outcome.status !== null) {
      const bodyStr = typeof outcome.body === "string" ? outcome.body : JSON.stringify(outcome.body ?? "");
      testResults = executeScript(testScript, {
        response: {
          status: outcome.status,
          statusText: "",
          headers: outcome.headers,
          body: bodyStr,
          durationMs: outcome.durationMs,
        },
        envVariables: parsed.data.envVariables ?? {},
      });
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
      url: parsed.data.url,
      headers: parsed.data.headers,
      body_mode: parsed.data.bodyMode ?? "none",
      body_raw: parsed.data.bodyRaw ?? "",
      body_form: parsed.data.bodyForm ?? [],
      auth: authConfig,
      body: parsed.data.bodyRaw ?? "",
      environment_name: environmentName,
      response_status: outcome.status,
      response_headers: outcome.headers,
      response_body: maybeTruncate(outcome.body),
      duration_ms: outcome.durationMs,
      error_code: outcome.errorCode,
      error: outcome.error,
      test_results: testResults,
    });

    if (requestId) {
      await SavedRequestModel.updateOne(
        {
          _id: requestId,
          tenant_id: context.tenantId,
          workspace_id: context.workspaceId,
        },
        { $set: { last_used_at: new Date() } },
      );
    }

    if (outcome.error) {
      return NextResponse.json(
        {
          ok: false,
          status: 0,
          headers: [],
          body: null,
          durationMs: outcome.durationMs,
          historyId: historyDoc._id.toString(),
          errorCode: outcome.errorCode,
          error: outcome.error,
          testResults: [],
          timing: null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: outcome.status ? outcome.status < 400 : false,
      status: outcome.status,
      headers: outcome.headers,
      body: outcome.body,
      durationMs: outcome.durationMs,
      historyId: historyDoc._id.toString(),
      errorCode: outcome.errorCode,
      error: null,
      testResults,
      timing: null,
    });
  } catch (error) {
    return apiException(error);
  }
}
