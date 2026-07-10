import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { InvitationModel } from "@/lib/db/models/Invitation";
import { UserModel } from "@/lib/db/models/User";
import { WorkspaceModel } from "@/lib/db/models/Workspace";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toIsoDate } from "@/lib/server/serialize";
import { canInvite, canInviteAsRole, getWorkspaceMembership } from "@/lib/server/workspace-rbac";

export const runtime = "nodejs";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["Admin", "Member"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function toInvitationDto(invitation: {
  _id: unknown;
  tenant_id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by: string;
  expires_at: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(invitation._id),
    tenant_id: invitation.tenant_id,
    workspace_id: invitation.workspace_id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    invited_by: invitation.invited_by,
    expires_at: toIsoDate(invitation.expires_at),
    createdAt: toIsoDate(invitation.createdAt),
    updatedAt: toIsoDate(invitation.updatedAt),
  };
}

export async function GET(_request: Request, routeContext: RouteContext) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  const { id: workspaceId } = await routeContext.params;

  try {
    await connectToDatabase();

    const membership = await getWorkspaceMembership(context.tenantId, workspaceId, context.userId);
    if (!membership || !canInvite(membership.role)) {
      return apiError("Forbidden.", 403);
    }

    const invitations = await InvitationModel.find({
      tenant_id: context.tenantId,
      workspace_id: workspaceId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const expiredIds: string[] = [];

    const data = invitations.map((invitation) => {
      if (invitation.status === "Pending" && invitation.expires_at < now) {
        expiredIds.push(String(invitation._id));
        return toInvitationDto({ ...invitation, status: "Expired" });
      }
      return toInvitationDto(invitation);
    });

    if (expiredIds.length > 0) {
      await InvitationModel.updateMany(
        { _id: { $in: expiredIds } },
        { $set: { status: "Expired" } },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    return apiException(error);
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  const { id: workspaceId } = await routeContext.params;

  try {
    const payload = await readJsonBody(request);
    const parsed = createInvitationSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid invitation payload.", 422);
    }

    await connectToDatabase();

    const membership = await getWorkspaceMembership(context.tenantId, workspaceId, context.userId);
    if (!membership || !canInvite(membership.role)) {
      return apiError("Forbidden.", 403);
    }

    if (!canInviteAsRole(membership.role, parsed.data.role)) {
      return apiError(`You cannot invite someone as ${parsed.data.role}.`, 403);
    }

    const workspace = await WorkspaceModel.findOne({
      _id: workspaceId,
      tenant_id: context.tenantId,
    }).lean();

    if (!workspace) {
      return apiError("Workspace not found.", 404);
    }

    const existingUser = await UserModel.findOne({ email: parsed.data.email }).lean();
    if (existingUser) {
      const existingMembership = await WorkspaceMemberModel.findOne({
        workspace_id: workspaceId,
        user_id: existingUser._id.toString(),
      }).lean();

      if (existingMembership) {
        return apiError("This person is already a member of the workspace.", 409);
      }
    }

    const existingPending = await InvitationModel.findOne({
      workspace_id: workspaceId,
      email: parsed.data.email,
      status: "Pending",
      expires_at: { $gt: new Date() },
    }).lean();

    if (existingPending) {
      return apiError("An invitation is already pending for this email.", 409);
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await InvitationModel.create({
      tenant_id: context.tenantId,
      workspace_id: workspaceId,
      email: parsed.data.email,
      role: parsed.data.role,
      token,
      status: "Pending",
      invited_by: context.userId,
      expires_at: expiresAt,
    });

    const inviteUrl = `${new URL(request.url).origin}/invite/${token}`;

    return NextResponse.json(
      {
        data: {
          ...toInvitationDto(invitation),
          inviteUrl,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiException(error);
  }
}
