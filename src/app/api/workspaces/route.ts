import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { WorkspaceModel } from "@/lib/db/models/Workspace";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(150),
});

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const memberships = await WorkspaceMemberModel.find({
      tenant_id: context.tenantId,
      user_id: context.userId,
    }).lean();

    const workspaceIds = memberships.map((membership) => membership.workspace_id);
    const roleByWorkspaceId = new Map(
      memberships.map((membership) => [membership.workspace_id.toString(), membership.role]),
    );

    const workspaces = await WorkspaceModel.find({
      tenant_id: context.tenantId,
      _id: { $in: workspaceIds },
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      data: workspaces.map((workspace) => ({
        id: toId(workspace._id),
        tenant_id: workspace.tenant_id,
        name: workspace.name,
        is_default: workspace.is_default ?? false,
        role: roleByWorkspaceId.get(workspace._id.toString()) ?? "Member",
        createdAt: toIsoDate(workspace.createdAt),
        updatedAt: toIsoDate(workspace.updatedAt),
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

  try {
    const payload = await readJsonBody(request);
    const parsed = createWorkspaceSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid workspace payload.", 422);
    }

    await connectToDatabase();

    const workspace = await WorkspaceModel.create({
      tenant_id: context.tenantId,
      name: parsed.data.name,
      is_default: false,
      created_by: context.userId,
    });

    await WorkspaceMemberModel.create({
      tenant_id: context.tenantId,
      workspace_id: workspace._id.toString(),
      user_id: context.userId,
      role: "Owner",
      status: "Active",
      joined_at: new Date(),
    });

    return NextResponse.json(
      {
        data: {
          id: workspace._id.toString(),
          tenant_id: workspace.tenant_id,
          name: workspace.name,
          is_default: workspace.is_default,
          role: "Owner",
          createdAt: workspace.createdAt.toISOString(),
          updatedAt: workspace.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiException(error);
  }
}
