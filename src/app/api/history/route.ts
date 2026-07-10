import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db/connect";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { apiError, parseObjectId } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  await connectToDatabase();

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "mine";
  const collectionId = parseObjectId(searchParams.get("collectionId"));
  const limitParam = Number(searchParams.get("limit") ?? 40);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(limitParam, 200))
    : 40;

  const filter: {
    tenant_id: string;
    workspace_id: string;
    user_id?: Types.ObjectId;
    collection_id?: Types.ObjectId;
  } = {
    tenant_id: context.tenantId,
    workspace_id: context.workspaceId,
  };

  if (scope !== "tenant") {
    filter.user_id = new Types.ObjectId(context.userId);
  }

  if (searchParams.get("collectionId") !== null && collectionId) {
    filter.collection_id = collectionId;
  }

  const history = await RequestHistoryModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({
    data: history.map((entry) => ({
      id: toId(entry._id),
      tenant_id: entry.tenant_id,
      workspace_id: toId(entry.workspace_id),
      user_id: toId(entry.user_id),
      collection_id: entry.collection_id ? toId(entry.collection_id) : null,
      request_id: entry.request_id ? toId(entry.request_id) : null,
      method: entry.method,
      url: entry.url,
      headers: entry.headers,
      body: entry.body,
      environment_name: entry.environment_name,
      response_status: entry.response_status,
      response_headers: entry.response_headers,
      response_body: entry.response_body,
      duration_ms: entry.duration_ms,
      error: entry.error,
      createdAt: toIsoDate(entry.createdAt),
      updatedAt: toIsoDate(entry.updatedAt),
    })),
  });
}
