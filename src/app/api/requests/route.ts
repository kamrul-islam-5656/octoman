import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import {
  ApiHttpError,
  apiError,
  apiException,
  normalizeHeaders,
  parseObjectId,
  readJsonBody,
} from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import {
  HTTP_METHOD_VALUES,
  REQUEST_BODY_MODE_VALUES,
  createDefaultAuthConfig,
  createInheritAuthConfig,
  keyValueSchema,
  normalizeAuthConfig,
  normalizeBodyForm,
  normalizeBodyMode,
  requestAuthSchema,
} from "@/lib/server/request-contract";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(""),
  method: z.enum(HTTP_METHOD_VALUES),
  url: z.string().trim().min(1).max(3000),
  headers: z.array(keyValueSchema).default([]),
  bodyMode: z.enum(REQUEST_BODY_MODE_VALUES).optional(),
  bodyRaw: z.string().max(500000).optional(),
  bodyForm: z.array(keyValueSchema).optional(),
  body: z.string().max(500000).optional(),
  auth: requestAuthSchema.optional(),
  collectionId: z.string().trim().optional().nullable(),
  folderId: z.string().trim().optional().nullable(),
});

function parseFilterId(
  rawValue: string | null,
  label: string,
): Types.ObjectId | null | undefined {
  if (rawValue === null) {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (!normalized || normalized === "null" || normalized === "none") {
    return null;
  }

  const parsed = parseObjectId(rawValue);
  if (!parsed) {
    throw new ApiHttpError(`Invalid ${label}.`, 400, "INVALID_OBJECT_ID");
  }

  return parsed;
}

function toRequestDto(item: Record<string, unknown>) {
  const bodyRaw =
    typeof item.body_raw === "string"
      ? item.body_raw
      : typeof item.body === "string"
        ? item.body
        : "";

  const auth = normalizeAuthConfig(item.auth);

  return {
    id: toId(item._id as string | Types.ObjectId | null | undefined),
    tenant_id: String(item.tenant_id),
    workspace_id: toId(item.workspace_id as string | Types.ObjectId | null | undefined),
    collection_id: item.collection_id ? toId(item.collection_id as string | Types.ObjectId | null | undefined) : null,
    folder_id: item.folder_id ? toId(item.folder_id as string | Types.ObjectId | null | undefined) : null,
    created_by: toId(item.created_by as string | Types.ObjectId | null | undefined),
    name: String(item.name ?? ""),
    description: String(item.description ?? ""),
    method: String(item.method ?? "GET"),
    url: String(item.url ?? ""),
    headers: Array.isArray(item.headers) ? item.headers : [],
    body_mode: String(item.body_mode ?? "raw"),
    body_raw: bodyRaw,
    body_form: Array.isArray(item.body_form) ? item.body_form : [],
    auth,
    body: bodyRaw,
    last_used_at:
      item.last_used_at instanceof Date
        ? item.last_used_at.toISOString()
        : item.last_used_at
          ? String(item.last_used_at)
          : null,
    createdAt: toIsoDate(item.createdAt as string | Date | null | undefined),
    updatedAt: toIsoDate(item.updatedAt as string | Date | null | undefined),
  };
}

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const collectionId = parseFilterId(searchParams.get("collectionId"), "collection id");
    const folderId = parseFilterId(searchParams.get("folderId"), "folder id");

    const filter: {
      tenant_id: string;
      workspace_id: string;
      collection_id?: Types.ObjectId | null;
      folder_id?: Types.ObjectId | null;
    } = {
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
    };

    if (collectionId !== undefined) {
      filter.collection_id = collectionId;
    }

    if (folderId !== undefined) {
      filter.folder_id = folderId;
    }

    const requests = await SavedRequestModel.find(filter)
      .sort({ updatedAt: -1 })
      .limit(250)
      .lean();

    return NextResponse.json({
      data: requests.map((item) => toRequestDto(item as Record<string, unknown>)),
    });
  } catch (error) {
    return apiException(error);
  }
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  if (!canMutate(context.role)) {
    return apiError("Forbidden.", 403);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid request payload.", 422);
    }

    const collectionId = parseObjectId(parsed.data.collectionId ?? null);
    const folderId = parseObjectId(parsed.data.folderId ?? null);
    let effectiveCollectionId = collectionId;

    await connectToDatabase();

    if (folderId) {
      const folder = await DocumentationFolderModel.findOne({
        _id: folderId,
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
      })
        .select({ _id: 1, collection_id: 1 })
        .lean();

      if (!folder) {
        return apiError("Selected folder was not found.", 404);
      }

      if (
        effectiveCollectionId &&
        folder.collection_id &&
        effectiveCollectionId.toString() !== folder.collection_id.toString()
      ) {
        return apiError("Selected folder belongs to a different collection.", 422);
      }

      effectiveCollectionId = effectiveCollectionId ?? folder.collection_id ?? null;
    }

    const bodyMode = normalizeBodyMode(parsed.data.bodyMode, parsed.data.method);
    const bodyRaw = (parsed.data.bodyRaw ?? parsed.data.body ?? "").slice(0, 500000);
    const bodyForm = normalizeBodyForm(parsed.data.bodyForm);
    const auth = parsed.data.auth
      ? normalizeAuthConfig(parsed.data.auth)
      : effectiveCollectionId || folderId
        ? createInheritAuthConfig()
        : createDefaultAuthConfig();

    const effectiveBodyRaw = bodyMode === "raw" ? bodyRaw : "";
    const effectiveBodyForm =
      bodyMode === "form-data" || bodyMode === "x-www-form-urlencoded" ? bodyForm : [];

    const created = await SavedRequestModel.create({
      _id: new Types.ObjectId(),
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
      collection_id: effectiveCollectionId,
      folder_id: folderId,
      created_by: new Types.ObjectId(context.userId),
      name: parsed.data.name,
      description: parsed.data.description,
      method: parsed.data.method,
      url: parsed.data.url,
      headers: normalizeHeaders(parsed.data.headers),
      body: effectiveBodyRaw,
      body_mode: bodyMode,
      body_raw: effectiveBodyRaw,
      body_form: effectiveBodyForm,
      auth,
    });

    return NextResponse.json(
      {
        data: {
          id: created._id.toString(),
          tenant_id: created.tenant_id,
          workspace_id: created.workspace_id.toString(),
          collection_id: created.collection_id?.toString() ?? null,
          folder_id: created.folder_id?.toString() ?? null,
          created_by: created.created_by.toString(),
          name: created.name,
          description: created.description,
          method: created.method,
          url: created.url,
          headers: created.headers,
          body_mode: created.body_mode,
          body_raw: created.body_raw,
          body_form: created.body_form,
          auth: normalizeAuthConfig(created.auth),
          body: created.body,
          last_used_at: created.last_used_at ? created.last_used_at.toISOString() : null,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiException(error);
  }
}
