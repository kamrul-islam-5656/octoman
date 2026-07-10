import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth/options";
import { connectToDatabase } from "@/lib/db/connect";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { WorkspaceModel } from "@/lib/db/models/Workspace";
import { WorkspaceMemberModel, IWorkspaceMember } from "@/lib/db/models/WorkspaceMember";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

export interface TenantContext {
  userId: string;
  organizationId: string;
  tenantId: string;
  role: string;
  workspaceId: string;
  workspaceRole: IWorkspaceMember["role"];
}

async function ensureDefaultWorkspace(tenantId: string, userId: string) {
  await connectToDatabase();

  let workspace = await WorkspaceModel.findOne({ tenant_id: tenantId, is_default: true }).lean();

  if (!workspace) {
    try {
      workspace = await WorkspaceModel.create({
        tenant_id: tenantId,
        name: "Default Workspace",
        is_default: true,
        created_by: userId,
      });
    } catch {
      // Rare race: another request created it concurrently. Re-fetch.
      workspace = await WorkspaceModel.findOne({ tenant_id: tenantId, is_default: true }).lean();
    }
  }

  if (!workspace) {
    throw new Error("Failed to resolve the default workspace.");
  }

  const workspaceId = workspace._id.toString();

  let membership = await WorkspaceMemberModel.findOne({
    workspace_id: workspaceId,
    user_id: userId,
  }).lean();

  if (!membership) {
    try {
      membership = await WorkspaceMemberModel.create({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        role: "Owner",
        status: "Active",
        joined_at: new Date(),
      });
    } catch {
      membership = await WorkspaceMemberModel.findOne({
        workspace_id: workspaceId,
        user_id: userId,
      }).lean();
    }
  }

  // Backfill any pre-existing tenant resources that predate the workspace feature.
  await Promise.all([
    CollectionModel.updateMany(
      { tenant_id: tenantId, workspace_id: { $exists: false } },
      { $set: { workspace_id: workspaceId } },
    ),
    EnvironmentModel.updateMany(
      { tenant_id: tenantId, workspace_id: { $exists: false } },
      { $set: { workspace_id: workspaceId } },
    ),
    SavedRequestModel.updateMany(
      { tenant_id: tenantId, workspace_id: { $exists: false } },
      { $set: { workspace_id: workspaceId } },
    ),
    DocumentationFolderModel.updateMany(
      { tenant_id: tenantId, workspace_id: { $exists: false } },
      { $set: { workspace_id: workspaceId } },
    ),
    RequestHistoryModel.updateMany(
      { tenant_id: tenantId, workspace_id: { $exists: false } },
      { $set: { workspace_id: workspaceId } },
    ),
  ]);

  return { workspaceId, role: (membership?.role ?? "Owner") as IWorkspaceMember["role"] };
}

async function resolveActiveWorkspace(
  tenantId: string,
  userId: string,
): Promise<{ workspaceId: string; role: IWorkspaceMember["role"] }> {
  await connectToDatabase();

  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;

  if (cookieWorkspaceId && Types.ObjectId.isValid(cookieWorkspaceId)) {
    const membership = await WorkspaceMemberModel.findOne({
      tenant_id: tenantId,
      workspace_id: cookieWorkspaceId,
      user_id: userId,
    }).lean();

    if (membership) {
      return { workspaceId: cookieWorkspaceId, role: membership.role };
    }
  }

  const fallbackMembership = await WorkspaceMemberModel.findOne({
    tenant_id: tenantId,
    user_id: userId,
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (fallbackMembership) {
    return { workspaceId: fallbackMembership.workspace_id, role: fallbackMembership.role };
  }

  return ensureDefaultWorkspace(tenantId, userId);
}

export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  const user = session.user as {
    id: string;
    organizationId: string;
    role: string;
  };

  const { workspaceId, role: workspaceRole } = await resolveActiveWorkspace(
    user.organizationId,
    user.id,
  );

  return {
    userId: user.id,
    organizationId: user.organizationId,
    tenantId: user.organizationId, // In this setup, organizationId serves as tenantId
    role: user.role,
    workspaceId,
    workspaceRole,
  };
}
