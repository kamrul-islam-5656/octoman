import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db/connect";
import { InvitationModel } from "@/lib/db/models/Invitation";
import { apiError, apiException, parseObjectId } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { canInvite, getWorkspaceMembership } from "@/lib/server/workspace-rbac";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

// This segment is shared with /accept and /reject (which key off the invitation's
// secret token). DELETE instead takes the invitation's Mongo _id in the same slot —
// Next.js requires sibling dynamic routes to share one param name.
export async function DELETE(_request: Request, routeContext: RouteContext) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  const { token: id } = await routeContext.params;
  const invitationId = parseObjectId(id);
  if (!invitationId) {
    return apiError("Invalid invitation id.", 400);
  }

  try {
    await connectToDatabase();

    const invitation = await InvitationModel.findOne({
      _id: invitationId.toString(),
      tenant_id: context.tenantId,
    }).lean();

    if (!invitation) {
      return apiError("Invitation not found.", 404);
    }

    const membership = await getWorkspaceMembership(
      context.tenantId,
      invitation.workspace_id,
      context.userId,
    );

    if (!membership || !canInvite(membership.role)) {
      return apiError("Forbidden.", 403);
    }

    if (invitation.status !== "Pending") {
      return apiError("Only pending invitations can be cancelled.", 409);
    }

    await InvitationModel.deleteOne({ _id: invitationId.toString() });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiException(error);
  }
}
