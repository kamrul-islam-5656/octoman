import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toIsoDate } from "@/lib/server/serialize";
import {
  canChangeMemberRole,
  canRemoveMember,
  getWorkspaceMembership,
} from "@/lib/server/workspace-rbac";

export const runtime = "nodejs";

const updateRoleSchema = z.object({
  role: z.enum(["Admin", "Member"]),
});

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  const { id: workspaceId, userId: targetUserId } = await routeContext.params;

  try {
    const payload = await readJsonBody(request);
    const parsed = updateRoleSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid payload.", 422);
    }

    await connectToDatabase();

    const [callerMembership, targetMembership] = await Promise.all([
      getWorkspaceMembership(context.tenantId, workspaceId, context.userId),
      getWorkspaceMembership(context.tenantId, workspaceId, targetUserId),
    ]);

    if (!targetMembership) {
      return apiError("Member not found.", 404);
    }

    if (!canChangeMemberRole(callerMembership?.role, targetMembership.role)) {
      return apiError("Forbidden.", 403);
    }

    const updated = await WorkspaceMemberModel.findOneAndUpdate(
      { tenant_id: context.tenantId, workspace_id: workspaceId, user_id: targetUserId },
      { $set: { role: parsed.data.role } },
      { new: true },
    ).lean();

    if (!updated) {
      return apiError("Member not found.", 404);
    }

    return NextResponse.json({
      data: {
        userId: updated.user_id,
        role: updated.role,
        status: updated.status,
        joined_at: toIsoDate(updated.joined_at),
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

  const { id: workspaceId, userId: targetUserId } = await routeContext.params;

  try {
    await connectToDatabase();

    const [callerMembership, targetMembership] = await Promise.all([
      getWorkspaceMembership(context.tenantId, workspaceId, context.userId),
      getWorkspaceMembership(context.tenantId, workspaceId, targetUserId),
    ]);

    if (!targetMembership) {
      return apiError("Member not found.", 404);
    }

    if (
      !canRemoveMember(context.userId, targetUserId, callerMembership?.role, targetMembership.role)
    ) {
      return apiError("Forbidden.", 403);
    }

    await WorkspaceMemberModel.deleteOne({
      tenant_id: context.tenantId,
      workspace_id: workspaceId,
      user_id: targetUserId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiException(error);
  }
}
