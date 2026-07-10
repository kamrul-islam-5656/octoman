import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import {
  apiError,
  apiException,
  parseObjectId,
  readJsonBody,
} from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { normalizeAuthConfig, requestAuthSchema } from "@/lib/server/request-contract";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const updateCollectionSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).optional(),
  environmentId: z.string().trim().optional().nullable(),
  auth: requestAuthSchema.optional(),
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
  const collectionId = parseObjectId(id);
  if (!collectionId) {
    return apiError("Invalid collection id.", 400);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = updateCollectionSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid update payload.", 422);
    }

    if (parsed.data.auth?.type === "inherit") {
      return apiError("Collection authorization cannot be set to inherit.", 422);
    }

    const updatePayload: {
      name?: string;
      description?: string;
      environment_id?: Types.ObjectId | null;
      auth?: ReturnType<typeof normalizeAuthConfig>;
    } = {};

    if (parsed.data.name !== undefined) {
      updatePayload.name = parsed.data.name;
    }

    if (parsed.data.description !== undefined) {
      updatePayload.description = parsed.data.description;
    }

    if (parsed.data.auth !== undefined) {
      updatePayload.auth = normalizeAuthConfig(parsed.data.auth);
    }

    await connectToDatabase();

    if (Object.prototype.hasOwnProperty.call(parsed.data, "environmentId")) {
      const environmentId = parseObjectId(parsed.data.environmentId ?? null);
      if (parsed.data.environmentId && !environmentId) {
        return apiError("Invalid environment id.", 400);
      }

      if (environmentId) {
        const environment = await EnvironmentModel.findOne({
          _id: environmentId.toString(),
          tenant_id: session.tenantId,
          workspace_id: session.workspaceId,
        })
          .select({ _id: 1 })
          .lean();

        if (!environment) {
          return apiError("Selected environment was not found.", 404);
        }
      }

      updatePayload.environment_id = environmentId;
    }

    if (Object.keys(updatePayload).length === 0) {
      return apiError("Invalid update payload.", 422);
    }

    const updated = await CollectionModel.findOneAndUpdate(
      {
        _id: collectionId,
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
      },
      {
        $set: updatePayload,
      },
      {
        new: true,
      },
    ).lean();

    if (!updated) {
      return apiError("Collection not found.", 404);
    }

    return NextResponse.json({
      data: {
        id: updated._id.toString(),
        tenant_id: updated.tenant_id,
        workspace_id: toId(updated.workspace_id),
        name: updated.name,
        description: updated.description,
        environment_id: updated.environment_id?.toString() ?? null,
        auth: normalizeAuthConfig(updated.auth),
        created_by: updated.created_by.toString(),
        sort_order: updated.sort_order ?? 0,
        published: updated.published ?? false,
        publish_slug: updated.publish_slug ?? "",
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
  const collectionId = parseObjectId(id);
  if (!collectionId) {
    return apiError("Invalid collection id.", 400);
  }

  try {
    await connectToDatabase();

    const deleted = await CollectionModel.findOneAndDelete({
      _id: collectionId,
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
    }).lean();

    if (!deleted) {
      return apiError("Collection not found.", 404);
    }

    const collectionFolders = await DocumentationFolderModel.find({
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
      collection_id: collectionId,
    })
      .select({ _id: 1 })
      .lean();

    const folderIds = collectionFolders.map((folder) => folder._id);

    await Promise.all([
      DocumentationFolderModel.deleteMany({
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
        collection_id: collectionId,
      }),
      SavedRequestModel.deleteMany({
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
        $or: [
          { collection_id: collectionId },
          ...(folderIds.length > 0 ? [{ folder_id: { $in: folderIds } }] : []),
        ],
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiException(error);
  }
}