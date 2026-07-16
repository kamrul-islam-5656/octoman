import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db/connect";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { OrganizationModel } from "@/lib/db/models/Organization";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { apiError, apiException, parseObjectId } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { normalizeAuthConfig } from "@/lib/server/request-contract";
import { KeyValuePair, RequestAuthConfig } from "@/types";

export const runtime = "nodejs";

interface ExportFolder {
  id: string;
  collectionId: string | null;
  parentId: string | null;
  name: string;
  description: string;
}

interface ExportRequest {
  id: string;
  collectionId: string | null;
  folderId: string | null;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: KeyValuePair[];
  bodyMode: string;
  bodyRaw: string;
  bodyForm: KeyValuePair[];
  auth: RequestAuthConfig;
}

function toPostmanAuth(auth: RequestAuthConfig): Record<string, unknown> | undefined {
  if (auth.type === "inherit") {
    return undefined;
  }

  if (auth.type === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: auth.basic.username, type: "string" },
        { key: "password", value: auth.basic.password, type: "string" },
      ],
    };
  }

  if (auth.type === "bearer") {
    return {
      type: "bearer",
      bearer: [{ key: "token", value: auth.bearerToken, type: "string" }],
    };
  }

  if (auth.type === "api-key") {
    return {
      type: "apikey",
      apikey: [
        { key: "key", value: auth.apiKey.key, type: "string" },
        { key: "value", value: auth.apiKey.value, type: "string" },
        { key: "in", value: auth.apiKey.addTo, type: "string" },
      ],
    };
  }

  return { type: "noauth" };
}

function toPostmanBody(
  bodyMode: string,
  bodyRaw: string,
  bodyForm: KeyValuePair[],
): Record<string, unknown> | undefined {
  if (bodyMode === "raw" && bodyRaw.trim()) {
    return { mode: "raw", raw: bodyRaw, options: { raw: { language: "json" } } };
  }

  if (bodyMode === "form-data") {
    return {
      mode: "formdata",
      formdata: bodyForm.map((item) => ({
        key: item.key,
        value: item.value,
        type: "text",
        disabled: item.enabled === false,
      })),
    };
  }

  if (bodyMode === "x-www-form-urlencoded") {
    return {
      mode: "urlencoded",
      urlencoded: bodyForm.map((item) => ({
        key: item.key,
        value: item.value,
        disabled: item.enabled === false,
      })),
    };
  }

  return undefined;
}

function requestToPostmanItem(request: ExportRequest): Record<string, unknown> {
  const header = request.headers.map((item) => ({
    key: item.key,
    value: item.value,
    disabled: item.enabled === false,
  }));

  const body = toPostmanBody(request.bodyMode, request.bodyRaw, request.bodyForm);
  const auth = toPostmanAuth(request.auth);

  return {
    name: request.name || "Untitled Request",
    description: request.description || undefined,
    request: {
      method: request.method,
      header,
      ...(body ? { body } : {}),
      ...(auth ? { auth } : {}),
      url: request.url,
    },
  };
}

function buildPostmanItemTree(
  parentId: string | null,
  folders: ExportFolder[],
  requests: ExportRequest[],
): Record<string, unknown>[] {
  const childFolders = folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childRequests = requests
    .filter((request) => request.folderId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const folderItems = childFolders.map((folder) => ({
    name: folder.name || "Untitled Folder",
    description: folder.description || undefined,
    item: buildPostmanItemTree(folder.id, folders, requests),
  }));

  const requestItems = childRequests.map((request) => requestToPostmanItem(request));

  return [...folderItems, ...requestItems];
}

function buildPostmanCollection(
  collectionName: string,
  collectionDescription: string,
  folders: ExportFolder[],
  requests: ExportRequest[],
  variables: { key: string; value: string }[] = [],
): Record<string, unknown> {
  return {
    info: {
      _postman_id: randomUUID(),
      name: collectionName,
      description: collectionDescription || undefined,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: buildPostmanItemTree(null, folders, requests),
    variable: variables.map((variable) => ({ key: variable.key, value: variable.value })),
  };
}

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  if (context.role !== "Admin") {
    return apiError("Forbidden.", 403);
  }

  const organizationId = parseObjectId(context.organizationId);
  if (!organizationId) {
    return apiError("Invalid organization context.", 400);
  }

  const requestUrl = new URL(request.url);
  const collectionIdParam = requestUrl.searchParams.get("collectionId");
  let collectionObjectId: ReturnType<typeof parseObjectId> = null;

  if (collectionIdParam) {
    collectionObjectId = parseObjectId(collectionIdParam);
    if (!collectionObjectId) {
      return apiError("Invalid collection id.", 400);
    }
  }

  try {
    await connectToDatabase();

    const [organization, collections, folders, requests, environments] = await Promise.all([
      OrganizationModel.findOne({
        _id: organizationId.toString(),
        tenant_id: context.tenantId,
      }).lean(),
      CollectionModel.find({
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        ...(collectionObjectId ? { _id: collectionObjectId } : {}),
      })
        .sort({ updatedAt: -1 })
        .lean(),
      DocumentationFolderModel.find({
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        ...(collectionObjectId ? { collection_id: collectionObjectId } : {}),
      })
        .sort({ parent_id: 1, name: 1 })
        .lean(),
      SavedRequestModel.find({
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        ...(collectionObjectId ? { collection_id: collectionObjectId } : {}),
      })
        .sort({ updatedAt: -1 })
        .lean(),
      EnvironmentModel.find({
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        ...(collectionObjectId ? { collection_id: collectionObjectId.toString() } : {}),
      })
        .sort({ is_default: -1, updatedAt: -1 })
        .lean(),
    ]);

    if (!organization) {
      return apiError("Organization not found.", 404);
    }

    if (collectionObjectId && collections.length === 0) {
      return apiError("Collection not found.", 404);
    }

    const mappedFolders: ExportFolder[] = folders.map((item) => ({
      id: item._id.toString(),
      collectionId: item.collection_id?.toString() ?? null,
      parentId: item.parent_id?.toString() ?? null,
      name: item.name,
      description: item.description,
    }));

    const mappedRequests: ExportRequest[] = requests.map((item) => {
      const bodyRaw =
        typeof item.body_raw === "string"
          ? item.body_raw
          : typeof item.body === "string"
            ? item.body
            : "";

      return {
        id: item._id.toString(),
        collectionId: item.collection_id?.toString() ?? null,
        folderId: item.folder_id?.toString() ?? null,
        name: item.name,
        description: item.description,
        method: item.method,
        url: item.url,
        headers: item.headers ?? [],
        bodyMode: item.body_mode ?? "raw",
        bodyRaw,
        bodyForm: item.body_form ?? [],
        auth: normalizeAuthConfig(item.auth),
      };
    });

    if (collectionObjectId) {
      const targetCollection = collections[0];
      const activeEnvironment = environments.find((item) => item.is_default) ?? environments[0];

      return NextResponse.json({
        data: buildPostmanCollection(
          targetCollection.name,
          targetCollection.description,
          mappedFolders,
          mappedRequests,
          activeEnvironment?.variables ?? [],
        ),
      });
    }

    return NextResponse.json({
      data: {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        organization: {
          id: organization._id.toString(),
          name: organization.name,
          slug: organization.slug,
        },
        collections: collections.map((item) => ({
          id: item._id.toString(),
          name: item.name,
          description: item.description,
        })),
        folders: mappedFolders,
        requests: mappedRequests.map((item) => ({ ...item, body: item.bodyRaw })),
        environments: environments.map((item) => ({
          id: item._id.toString(),
          collectionId: item.collection_id.toString(),
          name: item.name,
          is_default: item.is_default,
          variables: item.variables,
        })),
      },
    });
  } catch (error) {
    return apiException(error);
  }
}
