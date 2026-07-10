import { WorkspaceMemberModel, IWorkspaceMember } from "@/lib/db/models/WorkspaceMember";

export type WorkspaceRole = IWorkspaceMember["role"];

export async function getWorkspaceMembership(
  tenantId: string,
  workspaceId: string,
  userId: string,
): Promise<IWorkspaceMember | null> {
  return WorkspaceMemberModel.findOne({
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
  }).lean();
}

export function canInvite(role: WorkspaceRole | undefined): boolean {
  return role === "Owner" || role === "Admin";
}

export function canInviteAsRole(
  actingRole: WorkspaceRole | undefined,
  targetRole: "Admin" | "Member",
): boolean {
  if (actingRole === "Owner") {
    return targetRole === "Admin" || targetRole === "Member";
  }

  if (actingRole === "Admin") {
    return targetRole === "Member";
  }

  return false;
}

export function canChangeMemberRole(
  actingRole: WorkspaceRole | undefined,
  currentTargetRole: WorkspaceRole,
): boolean {
  return actingRole === "Owner" && currentTargetRole !== "Owner";
}

export function canRemoveMember(
  actingUserId: string,
  targetUserId: string,
  actingRole: WorkspaceRole | undefined,
  targetRole: WorkspaceRole,
): boolean {
  if (actingRole === "Owner") {
    return actingUserId !== targetUserId;
  }

  if (actingRole === "Admin") {
    return targetRole === "Member";
  }

  return false;
}
