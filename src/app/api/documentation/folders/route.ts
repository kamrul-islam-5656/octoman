import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import {
  apiError,
  apiException,
  parseObjectId,
  readJsonBody,
} from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { createInheritAuthConfig, normalizeAuthConfig, requestAuthSchema } from "@/lib/server/request-contract";
import { toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(""),
  collectionId: z.string().trim().optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
  auth: requestAuthSchema.optional(),
});

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const folders = await DocumentationFolderModel.find({
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
    })
      .sort({ parent_id: 1, name: 1, updatedAt: -1 })
      .lean();

    return NextResponse.json({
      data: folders.map((folder) => ({
        id: folder._id.toString(),
        tenant_id: folder.tenant_id,
        workspace_id: folder.workspace_id.toString(),
        collection_id: folder.collection_id?.toString() ?? null,
        parent_id: folder.parent_id?.toString() ?? null,
        name: folder.name,
        description: folder.description,
        auth: normalizeAuthConfig(folder.auth),
        created_by: folder.created_by.toString(),
        createdAt: toIsoDate(folder.createdAt),
        updatedAt: toIsoDate(folder.updatedAt),
      })),
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
    const parsed = createFolderSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid folder payload.", 422);
    }

    const parentId = parseObjectId(parsed.data.parentId ?? null);
    const collectionId = parseObjectId(parsed.data.collectionId ?? null);

    await connectToDatabase();

    let effectiveCollectionId = collectionId;

    if (parentId) {
      const parentFolder = await DocumentationFolderModel.findOne({
        _id: parentId,
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
      })
        .select({ _id: 1, collection_id: 1 })
        .lean();

      if (!parentFolder) {
        return apiError("Parent folder not found.", 404);
      }

      effectiveCollectionId = parentFolder.collection_id ?? effectiveCollectionId ?? null;
      if (
        collectionId &&
        effectiveCollectionId &&
        collectionId.toString() !== effectiveCollectionId.toString()
      ) {
        return apiError("Parent folder belongs to a different collection.", 422);
      }
    }

    if (!effectiveCollectionId) {
      return apiError("Collection is required for top-level folders.", 422);
    }

    const targetCollection = await CollectionModel.findOne({
      _id: effectiveCollectionId,
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
    })
      .select({ _id: 1 })
      .lean();

    if (!targetCollection) {
      return apiError("Collection not found.", 404);
    }

    const duplicate = await DocumentationFolderModel.findOne({
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
      collection_id: effectiveCollectionId,
      parent_id: parentId,
      name: parsed.data.name,
    })
      .select({ _id: 1 })
      .lean();

    if (duplicate) {
      return apiError("A folder with this name already exists at this level.", 409);
    }

    const created = await DocumentationFolderModel.create({
      _id: new Types.ObjectId(),
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
      collection_id: effectiveCollectionId,
      parent_id: parentId,
      name: parsed.data.name,
      description: parsed.data.description,
      auth: parsed.data.auth ? normalizeAuthConfig(parsed.data.auth) : createInheritAuthConfig(),
      created_by: new Types.ObjectId(context.userId),
    });

    return NextResponse.json(
      {
        data: {
          id: created._id.toString(),
          tenant_id: created.tenant_id,
          workspace_id: created.workspace_id.toString(),
          collection_id: created.collection_id?.toString() ?? null,
          parent_id: created.parent_id?.toString() ?? null,
          name: created.name,
          description: created.description,
          auth: normalizeAuthConfig(created.auth),
          created_by: created.created_by.toString(),
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
