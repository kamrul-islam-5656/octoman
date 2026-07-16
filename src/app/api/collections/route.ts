import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { CollectionDocument, CollectionModel } from "@/lib/db/models/Collection";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { createDefaultAuthConfig, normalizeAuthConfig, requestAuthSchema } from "@/lib/server/request-contract";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(""),
  auth: requestAuthSchema.optional(),
});

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const collections = await CollectionModel.find({
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      data: collections.map((collection) => ({
        id: toId(collection._id),
        tenant_id: collection.tenant_id,
        workspace_id: toId(collection.workspace_id),
        name: collection.name,
        description: collection.description,
        auth: normalizeAuthConfig(collection.auth),
        created_by: toId(collection.created_by),
        sort_order: collection.sort_order ?? 0,
        published: collection.published ?? false,
        publish_slug: collection.publish_slug ?? "",
        createdAt: toIsoDate(collection.createdAt),
        updatedAt: toIsoDate(collection.updatedAt),
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
    const parsed = createCollectionSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid collection payload.", 422);
    }

    if (parsed.data.auth?.type === "inherit") {
      return apiError("Collection authorization cannot be set to inherit.", 422);
    }

    await connectToDatabase();

    const created = await CollectionModel.create({
      _id: new Types.ObjectId(),
      tenant_id: context.tenantId,
      workspace_id: context.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description,
      auth: (parsed.data.auth
        ? normalizeAuthConfig(parsed.data.auth)
        : createDefaultAuthConfig()) as CollectionDocument["auth"],
      created_by: new Types.ObjectId(context.userId),
    });

    return NextResponse.json(
      {
        data: {
          id: created._id.toString(),
          tenant_id: created.tenant_id,
          workspace_id: toId(created.workspace_id),
          name: created.name,
          description: created.description,
          auth: normalizeAuthConfig(created.auth),
          created_by: created.created_by.toString(),
          sort_order: created.sort_order ?? 0,
          published: created.published ?? false,
          publish_slug: created.publish_slug ?? "",
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
