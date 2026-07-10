import { NextResponse } from "next/server";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import {
  apiError,
  apiException,
  parseObjectId,
  readJsonBody,
  toErrorMessage,
} from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { normalizeAuthConfig, requestAuthSchema } from "@/lib/server/request-contract";
import { toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).optional(),
  parentId: z.string().trim().optional().nullable(),
  auth: requestAuthSchema.optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function hasCycle(
  foldersById: Map<string, { parent_id?: unknown }>,
  folderId: string,
  nextParentId: string,
): boolean {
  let cursor: string | null = nextParentId;
  const visited = new Set<string>();

  while (cursor) {
    if (cursor === folderId) {
      return true;
    }

    if (visited.has(cursor)) {
      return true;
    }

    visited.add(cursor);
    const current = foldersById.get(cursor);
    const parent = current?.parent_id;
    cursor = parent ? String(parent) : null;
  }

  return false;
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
  const folderId = parseObjectId(id);
  if (!folderId) {
    return apiError("Invalid folder id.", 400);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = updateFolderSchema.safeParse(payload);

    if (!parsed.success) {
      return apiError("Invalid folder update payload.", 422);
    }

    if (Object.keys(parsed.data).length === 0) {
      return apiError("Invalid folder update payload.", 422);
    }

    const nextParentId = parseObjectId(parsed.data.parentId ?? null);
    if (nextParentId?.equals(folderId)) {
      return apiError("Folder cannot be its own parent.", 422);
    }

    await connectToDatabase();

    const [currentFolder, tenantFolders] = await Promise.all([
      DocumentationFolderModel.findOne({
        _id: folderId,
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
      }).lean(),
      DocumentationFolderModel.find({ tenant_id: session.tenantId, workspace_id: session.workspaceId })
        .select({ _id: 1, parent_id: 1, collection_id: 1 })
        .lean(),
    ]);

    if (!currentFolder) {
      return apiError("Folder not found.", 404);
    }

    if (nextParentId) {
      const parentFolder = tenantFolders.find(
        (folder) => folder._id.toString() === nextParentId.toString(),
      );

      if (!parentFolder) {
        return apiError("Parent folder not found.", 404);
      }

      if (
        (parentFolder.collection_id?.toString() ?? null) !==
        (currentFolder.collection_id?.toString() ?? null)
      ) {
        return apiError("Parent folder belongs to a different collection.", 422);
      }
    }

    const foldersById = new Map(
      tenantFolders.map((folder) => [folder._id.toString(), folder]),
    );

    if (
      nextParentId &&
      hasCycle(foldersById, folderId.toString(), nextParentId.toString())
    ) {
        return apiError("Folder hierarchy cannot contain circular references.", 422);
    }

    const updatePayload: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) {
      updatePayload.name = parsed.data.name;
    }

    if (parsed.data.description !== undefined) {
      updatePayload.description = parsed.data.description;
    }

    if (parsed.data.auth !== undefined) {
      updatePayload.auth = normalizeAuthConfig(parsed.data.auth);
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "parentId")) {
      updatePayload.parent_id = nextParentId;
    }

    const targetName =
      parsed.data.name !== undefined ? parsed.data.name : currentFolder.name;
    const targetParentId = Object.prototype.hasOwnProperty.call(parsed.data, "parentId")
      ? nextParentId
      : currentFolder.parent_id;

    const duplicate = await DocumentationFolderModel.findOne({
      _id: { $ne: folderId },
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
      collection_id: currentFolder.collection_id ?? null,
      parent_id: targetParentId,
      name: targetName,
    })
      .select({ _id: 1 })
      .lean();

    if (duplicate) {
      return apiError("A folder with this name already exists at this level.", 409);
    }

    const updated = await DocumentationFolderModel.findOneAndUpdate(
      {
        _id: folderId,
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
      },
      {
        $set: updatePayload,
      },
      { new: true },
    ).lean();

    if (!updated) {
      return apiError("Folder not found.", 404);
    }

    return NextResponse.json({
      data: {
        id: updated._id.toString(),
        tenant_id: updated.tenant_id,
        workspace_id: updated.workspace_id.toString(),
        collection_id: updated.collection_id?.toString() ?? null,
        parent_id: updated.parent_id?.toString() ?? null,
        name: updated.name,
        description: updated.description,
        auth: normalizeAuthConfig(updated.auth),
        created_by: updated.created_by.toString(),
        createdAt: toIsoDate(updated.createdAt),
        updatedAt: toIsoDate(updated.updatedAt),
      },
    });
  } catch (error) {
    const message = toErrorMessage(error);
    if (message.includes("Cast to ObjectId")) {
      return apiError("Invalid folder id.", 400);
    }

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
  const folderId = parseObjectId(id);
  if (!folderId) {
    return apiError("Invalid folder id.", 400);
  }

  try {
    await connectToDatabase();

    const folders = await DocumentationFolderModel.find({
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
    })
      .select({ _id: 1, parent_id: 1 })
      .lean();

    const targetFolder = folders.find(
      (folder) => folder._id.toString() === folderId.toString(),
    );

    if (!targetFolder) {
      return apiError("Folder not found.", 404);
    }

    const idsToDelete = new Set<string>([folderId.toString()]);
    let changed = true;

    while (changed) {
      changed = false;

      folders.forEach((folder) => {
        const parentId = folder.parent_id?.toString();
        if (!parentId) {
          return;
        }

        if (idsToDelete.has(parentId) && !idsToDelete.has(folder._id.toString())) {
          idsToDelete.add(folder._id.toString());
          changed = true;
        }
      });
    }

    const objectIds = Array.from(idsToDelete).flatMap((value) => {
      const parsed = parseObjectId(value);
      return parsed ? [parsed] : [];
    });

    await Promise.all([
      DocumentationFolderModel.deleteMany({
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
        _id: { $in: objectIds },
      }),
      SavedRequestModel.updateMany(
        {
          tenant_id: session.tenantId,
          workspace_id: session.workspaceId,
          folder_id: { $in: objectIds },
        },
        {
          $set: { folder_id: null },
        },
      ),
      RequestHistoryModel.updateMany(
        {
          tenant_id: session.tenantId,
          workspace_id: session.workspaceId,
          folder_id: { $in: objectIds },
        },
        {
          $set: { folder_id: null },
        },
      ),
    ]);

    return NextResponse.json({
      ok: true,
      deletedFolders: idsToDelete.size,
    });
  } catch (error) {
    return apiException(error);
  }
}
