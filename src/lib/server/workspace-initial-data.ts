import { Types } from "mongoose";

import { UserRole } from "@/types";
import { connectToDatabase } from "@/lib/db/connect";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { OrganizationModel } from "@/lib/db/models/Organization";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { UserModel } from "@/lib/db/models/User";
import { WorkspaceModel } from "@/lib/db/models/Workspace";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { normalizeAuthConfig } from "@/lib/server/request-contract";
import { sanitizeVariables, toId, toIsoDate } from "@/lib/server/serialize";

interface SessionUserContext {
  id: string;
  role: UserRole;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
}

interface WorkspaceInitialDataOptions {
  includeAdminData?: boolean;
}

export async function getWorkspaceInitialData(
  user: SessionUserContext,
  options: WorkspaceInitialDataOptions = {},
) {
  await connectToDatabase();

  const includeAdminData = Boolean(options.includeAdminData && user.role === "Admin");

  const [collections, requests, environments, history, folders, users, organization, memberships] =
    await Promise.all([
      CollectionModel.find({ tenant_id: user.tenantId, workspace_id: user.workspaceId })
        .sort({ updatedAt: -1 })
        .lean().catch(() => []),
      SavedRequestModel.find({ tenant_id: user.tenantId, workspace_id: user.workspaceId })
        .sort({ updatedAt: -1 })
        .limit(250)
        .lean().catch(() => []),
      EnvironmentModel.find({ tenant_id: user.tenantId, workspace_id: user.workspaceId })
        .sort({ is_default: -1, updatedAt: -1 })
        .lean().catch(() => []),
      RequestHistoryModel.find({
        tenant_id: user.tenantId,
        workspace_id: user.workspaceId,
        user_id: new Types.ObjectId(user.id),
      })
        .sort({ createdAt: -1 })
        .limit(40)
        .lean().catch(() => []),
      DocumentationFolderModel.find({ tenant_id: user.tenantId, workspace_id: user.workspaceId })
        .sort({ parent_id: 1, name: 1, updatedAt: -1 })
        .lean().catch(() => []),
      includeAdminData
        ? UserModel.find({
            tenant_id: user.tenantId,
            organization_id: user.organizationId,
          })
            .sort({ createdAt: -1 })
            .lean().catch(() => [])
        : UserModel.find({
            tenant_id: user.tenantId,
            organization_id: user.organizationId,
          })
            .select("_id name email role createdAt")
            .sort({ createdAt: -1 })
            .lean().catch(() => []),
      OrganizationModel.findOne({
        _id: user.organizationId,
        tenant_id: user.tenantId,
      }).lean().catch(() => null),
      WorkspaceMemberModel.find({ tenant_id: user.tenantId, user_id: user.id })
        .lean().catch(() => []),
    ]);

  const roleByWorkspaceId = new Map(
    memberships.map((membership) => [membership.workspace_id.toString(), membership.role]),
  );

  const workspaceDocs = await WorkspaceModel.find({
    tenant_id: user.tenantId,
    _id: { $in: memberships.map((membership) => membership.workspace_id) },
  })
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => []);

  const safeCollections = Array.isArray(collections) ? collections : [];
  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeEnvironments = Array.isArray(environments) ? environments : [];
  const safeHistory = Array.isArray(history) ? history : [];
  const safeFolders = Array.isArray(folders) ? folders : [];
  const safeUsers = Array.isArray(users) ? users : [];

  return {
    collections: safeCollections.map((item) => ({
      id: toId(item._id),
      tenant_id: item.tenant_id,
      workspace_id: toId(item.workspace_id),
      name: item.name,
      description: item.description,
      environment_id: item.environment_id ? toId(item.environment_id) : null,
      auth: normalizeAuthConfig(item.auth),
      created_by: toId(item.created_by),
      sort_order: item.sort_order ?? 0,
      published: item.published ?? false,
      publish_slug: item.publish_slug ?? "",
      createdAt: toIsoDate(item.createdAt),
      updatedAt: toIsoDate(item.updatedAt),
    })),
    requests: safeRequests.map((item) => {
      const bodyRaw =
        typeof item.body_raw === "string"
          ? item.body_raw
          : typeof item.body === "string"
            ? item.body
            : "";

      return {
        id: toId(item._id),
        tenant_id: item.tenant_id,
        workspace_id: toId(item.workspace_id),
        collection_id: item.collection_id ? toId(item.collection_id) : null,
        folder_id: item.folder_id ? toId(item.folder_id) : null,
        created_by: toId(item.created_by),
        name: item.name,
        description: item.description,
        method: item.method,
        url: item.url,
        headers: item.headers,
        body_mode: item.body_mode ?? "raw",
        body_raw: bodyRaw,
        body_form: item.body_form ?? [],
        auth: normalizeAuthConfig(item.auth),
        body: bodyRaw,
        request_type: item.request_type ?? "http",
        query_params: item.query_params ?? [],
        body_raw_language: item.body_raw_language ?? "json",
        pre_request_script: item.pre_request_script ?? "",
        test_script: item.test_script ?? "",
        graphql_query: item.graphql_query ?? "",
        graphql_variables: item.graphql_variables ?? "",
        examples: (item.examples ?? []).map((ex: { _id?: string | Types.ObjectId; name: string; status: number; headers: { key: string; value: string }[]; body: string }) => ({
          id: ex._id ? toId(ex._id) : "",
          name: ex.name,
          status: ex.status,
          headers: (ex.headers ?? []) as { key: string; value: string }[],
          body: ex.body,
        })),
        sort_order: item.sort_order ?? 0,
        last_used_at: item.last_used_at ? item.last_used_at.toISOString() : null,
        createdAt: toIsoDate(item.createdAt),
        updatedAt: toIsoDate(item.updatedAt),
      };
    }),
    environments: safeEnvironments.map((item) => ({
      id: toId(item._id),
      tenant_id: item.tenant_id,
      workspace_id: toId(item.workspace_id),
      name: item.name,
      is_default: item.is_default,
      variables: sanitizeVariables(item.variables),
      createdAt: toIsoDate(item.createdAt),
      updatedAt: toIsoDate(item.updatedAt),
    })),
    history: safeHistory.map((item) => {
      const bodyRaw =
        typeof item.body_raw === "string"
          ? item.body_raw
          : typeof item.body === "string"
            ? item.body
            : "";

      return {
        id: toId(item._id),
        tenant_id: item.tenant_id,
        workspace_id: toId(item.workspace_id),
        user_id: toId(item.user_id),
        collection_id: item.collection_id ? toId(item.collection_id) : null,
        folder_id: item.folder_id ? toId(item.folder_id) : null,
        request_id: item.request_id ? toId(item.request_id) : null,
        method: item.method,
        url: item.url,
        headers: item.headers ?? [],
        body_mode: item.body_mode ?? "raw",
        body_raw: bodyRaw,
        body_form: item.body_form ?? [],
        auth: normalizeAuthConfig(item.auth),
        body: bodyRaw,
        environment_name: item.environment_name ?? null,
        response_status: item.response_status ?? null,
        response_headers: item.response_headers ?? [],
        response_body: item.response_body ?? null,
        duration_ms: item.duration_ms,
        error_code: item.error_code ?? null,
        error: item.error ?? null,
        test_results: item.test_results ?? [],
        timing: item.timing ?? null,
        createdAt: toIsoDate(item.createdAt),
        updatedAt: toIsoDate(item.updatedAt),
      };
    }),
    folders: safeFolders.map((item) => ({
      id: toId(item._id),
      tenant_id: item.tenant_id,
      workspace_id: toId(item.workspace_id),
      collection_id: item.collection_id ? toId(item.collection_id) : null,
      parent_id: item.parent_id ? toId(item.parent_id) : null,
      name: item.name,
      description: item.description,
      auth: normalizeAuthConfig(item.auth),
      created_by: toId(item.created_by),
      sort_order: item.sort_order ?? 0,
      createdAt: toIsoDate(item.createdAt),
      updatedAt: toIsoDate(item.updatedAt),
    })),
    users: safeUsers.map((item) => ({
      id: toId(item._id),
      tenant_id: item.tenant_id,
      organization_id: toId(item.organization_id),
      name: item.name,
      email: item.email,
      role: item.role,
      createdAt: toIsoDate(item.createdAt),
      updatedAt: toIsoDate(item.updatedAt),
    })),
    organization: organization
      ? {
          id: toId(organization._id),
          tenant_id: organization.tenant_id,
          name: organization.name,
          slug: organization.slug,
          createdAt: toIsoDate(organization.createdAt),
          updatedAt: toIsoDate(organization.updatedAt),
        }
      : null,
    workspaces: workspaceDocs.map((workspace) => ({
      id: toId(workspace._id),
      tenant_id: workspace.tenant_id,
      name: workspace.name,
      is_default: workspace.is_default ?? false,
      role: roleByWorkspaceId.get(workspace._id.toString()) ?? "Member",
      createdAt: toIsoDate(workspace.createdAt),
      updatedAt: toIsoDate(workspace.updatedAt),
    })),
    activeWorkspaceId: user.workspaceId,
  };
}
