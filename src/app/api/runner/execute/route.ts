import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { RunResultModel } from "@/lib/db/models/RunResult";
import { apiError, apiException, readJsonBody, headersToRecord, normalizeHeaders, parseObjectId } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { normalizeAuthConfig, createDefaultAuthConfig, normalizeBodyMode, normalizeBodyForm } from "@/lib/server/request-contract";
import { interpolateString, interpolateHeaders, interpolateKeyValuePairs, variablesToMap } from "@/lib/server/interpolate";
import { executeScript } from "@/lib/scripting/pm-api";
import type { TestResult } from "@/types";

export const runtime = "nodejs";

const runSchema = z.object({
  collection_id: z.string().trim().min(1),
  environment_id: z.string().trim().optional().nullable(),
  iterations: z.number().int().min(1).max(100).default(1),
  delay_ms: z.number().int().min(0).max(10000).default(0),
});

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return apiError("Unauthorized.", 401);

  try {
    const payload = await readJsonBody(request);
    const parsed = runSchema.safeParse(payload);
    if (!parsed.success) return apiError("Invalid payload.", 422);

    await connectToDatabase();

    const collectionId = parseObjectId(parsed.data.collection_id);
    if (!collectionId) return apiError("Invalid collection ID.", 422);

    const envId = parseObjectId(parsed.data.environment_id ?? null);
    let variableMap: Record<string, string> = {};

    if (envId) {
      const env = await EnvironmentModel.findOne({ _id: envId.toString(), tenant_id: context.tenantId }).lean();
      if (env) variableMap = variablesToMap(env.variables);
    }

    const requests = await SavedRequestModel.find({
      collection_id: collectionId,
      tenant_id: context.tenantId,
    })
      .sort({ sort_order: 1, createdAt: 1 })
      .lean();

    const results: {
      iteration: number;
      request_id: string;
      request_name: string;
      method: string;
      url: string;
      status: number | null;
      duration_ms: number;
      passed: boolean;
      error: string | null;
      test_results: TestResult[];
    }[] = [];

    let totalPassed = 0;
    let totalFailed = 0;
    const startedAt = new Date();

    for (let iter = 1; iter <= parsed.data.iterations; iter++) {
      for (const req of requests) {
        const interpolatedUrl = interpolateString(req.url, variableMap);
        const normalizedHeaders = normalizeHeaders(req.headers ?? []);
        const interpolatedHeaders = interpolateHeaders(normalizedHeaders, variableMap);
        const headersRecord = headersToRecord(interpolatedHeaders);
        const bodyMode = normalizeBodyMode(req.body_mode, req.method);
        const rawBody = interpolateString(req.body_raw ?? req.body ?? "", variableMap);

        let bodyToSend: BodyInit | undefined;
        if (bodyMode === "raw" && rawBody.trim()) {
          bodyToSend = rawBody;
        } else if (bodyMode === "x-www-form-urlencoded") {
          const formPairs = interpolateKeyValuePairs(normalizeBodyForm(req.body_form), variableMap).filter((f) => f.enabled !== false);
          const params = new URLSearchParams();
          formPairs.forEach((f) => params.append(f.key, f.value));
          bodyToSend = params;
        }

        const start = Date.now();
        let status: number | null = null;
        let error: string | null = null;
        let responseBody = "";
        let responseHeaders: { key: string; value: string }[] = [];

        try {
          const parsedUrl = new URL(interpolatedUrl);
          const auth = normalizeAuthConfig(req.auth ?? createDefaultAuthConfig());
          let finalHeaders = { ...headersRecord };

          if (auth.type === "bearer" && auth.bearerToken) {
            finalHeaders.Authorization = `Bearer ${interpolateString(auth.bearerToken, variableMap)}`;
          } else if (auth.type === "basic") {
            const token = Buffer.from(`${interpolateString(auth.basic.username, variableMap)}:${interpolateString(auth.basic.password, variableMap)}`).toString("base64");
            finalHeaders.Authorization = `Basic ${token}`;
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const resp = await fetch(parsedUrl.toString(), {
            method: req.method,
            headers: finalHeaders,
            body: bodyToSend,
            cache: "no-store",
            signal: controller.signal,
          });

          clearTimeout(timeout);
          status = resp.status;
          responseBody = await resp.text();
          resp.headers.forEach((v, k) => responseHeaders.push({ key: k, value: v }));
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }

        const durationMs = Date.now() - start;

        // Run test scripts
        let testResults: TestResult[] = [];
        const testScript = req.test_script ?? "";
        if (testScript.trim() && status !== null) {
          const scriptResult = executeScript(testScript, {
            response: { status, statusText: "", headers: responseHeaders, body: responseBody, durationMs },
            envVariables: variableMap,
          });
          testResults = scriptResult;
        }

        const allPassed = !error && (status !== null && status < 400) && testResults.every((t) => t.passed);
        if (allPassed) totalPassed++;
        else totalFailed++;

        results.push({
          iteration: iter,
          request_id: req._id.toString(),
          request_name: req.name,
          method: req.method,
          url: interpolatedUrl,
          status,
          duration_ms: durationMs,
          passed: allPassed,
          error,
          test_results: testResults,
        });

        // Delay between requests
        if (parsed.data.delay_ms > 0) {
          await new Promise((resolve) => setTimeout(resolve, parsed.data.delay_ms));
        }
      }
    }

    const total = totalPassed + totalFailed;
    const runDoc = await RunResultModel.create({
      tenant_id: context.tenantId,
      collection_id: collectionId?.toString(),
      environment_id: envId?.toString(),
      total,
      passed: totalPassed,
      failed: totalFailed,
      iterations: parsed.data.iterations,
      delay_ms: parsed.data.delay_ms,
      status: "completed",
      results: results.map((r) => ({
        ...r,
        error: r.error ?? undefined,
      })),
      started_at: startedAt,
      completed_at: new Date(),
    });

    return NextResponse.json({
      run: {
        id: runDoc._id.toString(),
        total,
        passed: totalPassed,
        failed: totalFailed,
        iterations: parsed.data.iterations,
        status: "completed",
        results,
      },
    });
  } catch (error) {
    return apiException(error);
  }
}
