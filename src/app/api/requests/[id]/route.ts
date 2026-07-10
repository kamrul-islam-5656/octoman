import { NextResponse } from "next/server";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import {
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
  keyValueSchema,
  normalizeAuthConfig,
  normalizeBodyForm,
  normalizeBodyMode,
  requestAuthSchema,
} from "@/lib/server/request-contract";
import { toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const updateRequestSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).optional(),
  method: z.enum(HTTP_METHOD_VALUES).optional(),
  url: z.string().trim().min(1).max(3000).optional(),
  headers: z.array(keyValueSchema).optional(),
  bodyMode: z.enum(REQUEST_BODY_MODE_VALUES).optional(),
  bodyRaw: z.string().max(500000).optional(),
  bodyForm: z.array(keyValueSchema).optional(),
  body: z.string().max(500000).optional(),
  auth: requestAuthSchema.optional(),
  collectionId: z.string().trim().optional().nullable(),
  folderId: z.string().trim().optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  if (!canMutate(session.role)) {
    return apiError("Forbidden.", 403);
  }

  const { id } = await context.params;
  const requestId = parseObjectId(id);
  if (!requestId) {
    return apiError("Invalid request id.", 400);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = updateRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid update payload.", 422);
    }

    if (Object.keys(parsed.data).length === 0) {
      return apiError("Invalid update payload.", 422);
    }

    await connectToDatabase();

    const currentRequest = await SavedRequestModel.findOne({
      _id: requestId,
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
    })
      .select({ method: 1, collection_id: 1 })
      .lean();

    if (!currentRequest) {
      return apiError("Request not found.", 404);
    }

    const updatePayload: Record<string, unknown> = {};
    let targetCollectionId = Object.prototype.hasOwnProperty.call(parsed.data, "collectionId")
      ? parseObjectId(parsed.data.collectionId ?? null)
      : (currentRequest.collection_id ?? null);

    if (parsed.data.name !== undefined) {
      updatePayload.name = parsed.data.name;
    }

    if (parsed.data.description !== undefined) {
      updatePayload.description = parsed.data.description;
    }

    if (parsed.data.method !== undefined) {
      updatePayload.method = parsed.data.method;
    }

    if (parsed.data.url !== undefined) {
      updatePayload.url = parsed.data.url;
    }

    if (parsed.data.headers !== undefined) {
      updatePayload.headers = normalizeHeaders(parsed.data.headers);
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "collectionId")) {
      updatePayload.collection_id = targetCollectionId;
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "folderId")) {
      const folderId = parseObjectId(parsed.data.folderId ?? null);
      if (folderId) {
        const folder = await DocumentationFolderModel.findOne({
          _id: folderId,
          tenant_id: session.tenantId,
          workspace_id: session.workspaceId,
        })
          .select({ _id: 1, collection_id: 1 })
          .lean();

        if (!folder) {
          return apiError("Selected folder was not found.", 404);
        }

        if (
          targetCollectionId &&
          folder.collection_id &&
          targetCollectionId.toString() !== folder.collection_id.toString()
        ) {
          return apiError("Selected folder belongs to a different collection.", 422);
        }

        if (!targetCollectionId && folder.collection_id) {
          targetCollectionId = folder.collection_id;
          updatePayload.collection_id = targetCollectionId;
        }
      }

      updatePayload.folder_id = folderId;
    }

    const resolvedMethod =
      parsed.data.method ??
      (currentRequest.method as string | undefined) ??
      "GET";

    if (parsed.data.bodyMode !== undefined || parsed.data.bodyRaw !== undefined || parsed.data.body !== undefined || parsed.data.bodyForm !== undefined) {
      const bodyMode = normalizeBodyMode(
        parsed.data.bodyMode,
        resolvedMethod as (typeof HTTP_METHOD_VALUES)[number],
      );
      const bodyRaw = (parsed.data.bodyRaw ?? parsed.data.body ?? "").slice(0, 500000);
      const bodyForm = normalizeBodyForm(parsed.data.bodyForm);

      updatePayload.body_mode = bodyMode;
      updatePayload.body_raw = bodyMode === "raw" ? bodyRaw : "";
      updatePayload.body_form =
        bodyMode === "form-data" || bodyMode === "x-www-form-urlencoded" ? bodyForm : [];
      updatePayload.body = bodyMode === "raw" ? bodyRaw : "";
    }

    if (parsed.data.auth !== undefined) {
      updatePayload.auth = normalizeAuthConfig(parsed.data.auth ?? createDefaultAuthConfig());
    }

    const updated = await SavedRequestModel.findOneAndUpdate(
      {
        _id: requestId,
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
      },
      {
        $set: updatePayload,
      },
      { new: true },
    ).lean();

    if (!updated) {
      return apiError("Request not found.", 404);
    }

    const bodyRaw =
      typeof updated.body_raw === "string"
        ? updated.body_raw
        : typeof updated.body === "string"
          ? updated.body
          : "";

    return NextResponse.json({
      data: {
        id: updated._id.toString(),
        tenant_id: updated.tenant_id,
        workspace_id: updated.workspace_id.toString(),
        collection_id: updated.collection_id?.toString() ?? null,
        folder_id: updated.folder_id?.toString() ?? null,
        created_by: updated.created_by.toString(),
        name: updated.name,
        description: updated.description,
        method: updated.method,
        url: updated.url,
        headers: updated.headers,
        body_mode: updated.body_mode ?? "raw",
        body_raw: bodyRaw,
        body_form: updated.body_form ?? [],
        auth: normalizeAuthConfig(updated.auth),
        body: bodyRaw,
        last_used_at: updated.last_used_at ? updated.last_used_at.toISOString() : null,
        createdAt: toIsoDate(updated.createdAt),
        updatedAt: toIsoDate(updated.updatedAt),
      },
    });
  } catch (error) {
    return apiException(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  if (!canMutate(session.role)) {
    return apiError("Forbidden.", 403);
  }

  const { id } = await context.params;
  const requestId = parseObjectId(id);
  if (!requestId) {
    return apiError("Invalid request id.", 400);
  }

  try {
    await connectToDatabase();

    const deleted = await SavedRequestModel.findOneAndDelete({
      _id: requestId,
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
    }).lean();

    if (!deleted) {
      return apiError("Request not found.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiException(error);
  }
}