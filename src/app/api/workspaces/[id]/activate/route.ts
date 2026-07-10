import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db/connect";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException, parseObjectId } from "@/lib/server/api";
import { ACTIVE_WORKSPACE_COOKIE, getTenantContext } from "@/lib/server/auth";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, routeContext: RouteContext) {
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

    if (!membership) {
      return apiError("You are not a member of this workspace.", 403);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId.toString(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    return apiException(error);
  }
}
