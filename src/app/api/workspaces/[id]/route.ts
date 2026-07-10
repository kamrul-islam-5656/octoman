import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { WorkspaceModel } from "@/lib/db/models/Workspace";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException, parseObjectId, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(150),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  const { id } = await routeContext.params;
  const workspaceId = parseObjectId(id);
  if (!workspaceId) {
    return apiError("Invalid workspace id.", 400);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = updateWorkspaceSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid workspace payload.", 422);
    }

    await connectToDatabase();

    const membership = await WorkspaceMemberModel.findOne({
      tenant_id: context.tenantId,
      workspace_id: workspaceId.toString(),
      user_id: context.userId,
    }).lean();

    if (!membership || (membership.role !== "Owner" && membership.role !== "Admin")) {
      return apiError("Forbidden.", 403);
    }

    const updated = await WorkspaceModel.findOneAndUpdate(
      { _id: workspaceId.toString(), tenant_id: context.tenantId },
      { $set: { name: parsed.data.name } },
      { new: true },
    ).lean();

    if (!updated) {
      return apiError("Workspace not found.", 404);
    }

    return NextResponse.json({
      data: {
        id: updated._id.toString(),
        tenant_id: updated.tenant_id,
        name: updated.name,
        is_default: updated.is_default ?? false,
        role: membership.role,
        createdAt: toIsoDate(updated.createdAt),
        updatedAt: toIsoDate(updated.updatedAt),
      },
    });
  } catch (error) {
    return apiException(error);
  }
}

export async function DELETE(_request: Request, routeContext: RouteContext) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  const { id } = await routeContext.params;
  const workspaceId = parseObjectId(id);
  if (!workspaceId) {
    return apiError("Invalid workspace id.", 400);
  }

  try {
    await connectToDatabase();

    const membership = await WorkspaceMemberModel.findOne({
      tenant_id: context.tenantId,
      workspace_id: workspaceId.toString(),
      user_id: context.userId,
    }).lean();

    if (!membership || membership.role !== "Owner") {
      return apiError("Forbidden.", 403);
    }

    const remainingMemberships = await WorkspaceMemberModel.countDocuments({
      tenant_id: context.tenantId,
      user_id: context.userId,
    });

    if (remainingMemberships <= 1) {
      return apiError("You must have at least one workspace.", 409);
    }

    const deleted = await WorkspaceModel.findOneAndDelete({
      _id: workspaceId.toString(),
      tenant_id: context.tenantId,
    }).lean();

    if (!deleted) {
      return apiError("Workspace not found.", 404);
    }

    const scope = { tenant_id: context.tenantId, workspace_id: workspaceId.toString() };

    await Promise.all([
      CollectionModel.deleteMany(scope),
      EnvironmentModel.deleteMany(scope),
      SavedRequestModel.deleteMany(scope),
      DocumentationFolderModel.deleteMany(scope),
      RequestHistoryModel.deleteMany(scope),
      WorkspaceMemberModel.deleteMany({
        tenant_id: context.tenantId,
        workspace_id: workspaceId.toString(),
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiException(error);
  }
}
