import { NextResponse } from "next/server";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import {
  apiError,
  apiException,
  parseObjectId,
  readJsonBody,
} from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { sanitizeVariables, toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const environmentVariableSchema = z.object({
  key: z.string().trim().min(1).max(150),
  value: z.string().max(20000),
});

const updateEnvironmentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  is_default: z.boolean().optional(),
  variables: z.array(environmentVariableSchema).optional(),
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
  const environmentId = parseObjectId(id);
  if (!environmentId) {
    return apiError("Invalid environment id.", 400);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = updateEnvironmentSchema.safeParse(payload);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return apiError("Invalid update payload.", 422);
    }

    await connectToDatabase();

    if (parsed.data.is_default) {
      const target = await EnvironmentModel.findOne({
        _id: environmentId.toString(),
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
      })
        .select({ collection_id: 1 })
        .lean();

      if (!target) {
        return apiError("Environment not found.", 404);
      }

      await EnvironmentModel.updateMany(
        {
          tenant_id: session.tenantId,
          workspace_id: session.workspaceId,
          collection_id: target.collection_id,
          _id: { $ne: environmentId.toString() },
          is_default: true,
        },
        {
          $set: { is_default: false },
        },
      );
    }

    const updated = await EnvironmentModel.findOneAndUpdate(
      {
        _id: environmentId.toString(),
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
      },
      {
        $set: parsed.data,
      },
      { new: true },
    ).lean();

    if (!updated) {
      return apiError("Environment not found.", 404);
    }

    return NextResponse.json({
      data: {
        id: updated._id.toString(),
        tenant_id: updated.tenant_id,
        workspace_id: updated.workspace_id.toString(),
        collection_id: toId(updated.collection_id),
        name: updated.name,
        is_default: updated.is_default,
        variables: sanitizeVariables(updated.variables),
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
  const environmentId = parseObjectId(id);
  if (!environmentId) {
    return apiError("Invalid environment id.", 400);
  }

  try {
    await connectToDatabase();

    const deleted = await EnvironmentModel.findOneAndDelete({
      _id: environmentId.toString(),
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
    }).lean();

    if (!deleted) {
      return apiError("Environment not found.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiException(error);
  }
}