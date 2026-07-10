import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toIsoDate } from "@/lib/server/serialize";
import { getWorkspaceMembership } from "@/lib/server/workspace-rbac";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, routeContext: RouteContext) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  const { id: workspaceId } = await routeContext.params;

  try {
    await connectToDatabase();

    const callerMembership = await getWorkspaceMembership(
      context.tenantId,
      workspaceId,
      context.userId,
    );

    if (!callerMembership) {
      return apiError("Forbidden.", 403);
    }

    const members = await WorkspaceMemberModel.find({
      tenant_id: context.tenantId,
      workspace_id: workspaceId,
    })
      .sort({ joined_at: 1 })
      .lean();

    const users = await UserModel.find({
      _id: { $in: members.map((member) => member.user_id) },
    })
      .select("_id name email")
      .lean();

    const userById = new Map(users.map((user) => [user._id.toString(), user]));

    return NextResponse.json({
      data: members.map((member) => {
        const user = userById.get(member.user_id);
        return {
          userId: member.user_id,
          name: user?.name ?? "Unknown user",
          email: user?.email ?? "",
          role: member.role,
          status: member.status,
          joined_at: toIsoDate(member.joined_at),
          createdAt: toIsoDate(member.createdAt),
          updatedAt: toIsoDate(member.updatedAt),
        };
      }),
    });
  } catch (error) {
    return apiException(error);
  }
}
