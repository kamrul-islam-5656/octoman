import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { RequestHistoryModel } from "@/lib/db/models/RequestHistory";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import {
  apiError,
  apiException,
  normalizeHeaders,
  readJsonBody,
} from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import {
  HTTP_METHOD_VALUES,
  REQUEST_BODY_MODE_VALUES,
  createDefaultAuthConfig,
  keyValueSchema,
  normalizeAuthConfig,
  normalizeBodyForm,
  normalizeBodyMode,
  requestAuthSchema,
} from "@/lib/server/request-contract";

export const runtime = "nodejs";

const importCollectionSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(""),
  environmentId: z.string().trim().optional().nullable(),
});

const importFolderSchema = z.object({
  id: z.string().trim().optional(),
  collectionId: z.string().trim().optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(""),
});

const importRequestSchema = z.object({
  id: z.string().trim().optional(),
  collectionId: z.string().trim().optional().nullable(),
  folderId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(""),
  method: z.enum(HTTP_METHOD_VALUES).default("GET"),
  url: z.string().trim().min(1).max(3000),
  headers: z.array(keyValueSchema).default([]),
  bodyMode: z.enum(REQUEST_BODY_MODE_VALUES).optional(),
  bodyRaw: z.string().max(500000).optional(),
  bodyForm: z.array(keyValueSchema).optional(),
  body: z.string().max(500000).optional(),
  auth: requestAuthSchema.optional(),
});

const importEnvironmentSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1).max(120),
  is_default: z.boolean().optional().default(false),
  variables: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(150),
        value: z.string().max(20000),
      }),
    )
    .default([]),
});

const importDataSchema = z.object({
  schemaVersion: z.number().int().optional(),
  collections: z.array(importCollectionSchema).default([]),
  folders: z.array(importFolderSchema).default([]),
  requests: z.array(importRequestSchema).default([]),
  environments: z.array(importEnvironmentSchema).default([]),
});

const importEnvelopeSchema = z.object({
  mode: z.enum(["merge", "replace"]).optional().default("merge"),
  data: z.unknown(),
});

type ImportData = z.infer<typeof importDataSchema>;
type ImportCollection = z.infer<typeof importCollectionSchema>;
type ImportFolder = z.infer<typeof importFolderSchema>;
type ImportRequest = z.infer<typeof importRequestSchema>;
type ImportEnvironment = z.infer<typeof importEnvironmentSchema>;

const HTTP_METHOD_SET = new Set<string>(HTTP_METHOD_VALUES);
const EMPTY_IMPORT_DATA: ImportData = {
  schemaVersion: 1,
  collections: [],
  folders: [],
  requests: [],
  environments: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function readRawText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function readDescription(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, 1000);
  }

  if (isRecord(value)) {
    const content = readRawText(value.content ?? value.text ?? value.description);
    return content.slice(0, 1000);
  }

  return "";
}

function ensureUniqueName(name: string, usedNames: Set<string>): string {
  const base = name.trim() || "Imported";
  if (!usedNames.has(base.toLowerCase())) {
    usedNames.add(base.toLowerCase());
    return base;
  }

  let suffix = 2;
  while (usedNames.has(`${base.toLowerCase()} (${suffix})`)) {
    suffix += 1;
  }

  const next = `${base} (${suffix})`;
  usedNames.add(next.toLowerCase());
  return next;
}

function normalizeHttpMethod(value: unknown): (typeof HTTP_METHOD_VALUES)[number] {
  const method = readText(value).toUpperCase();
  return HTTP_METHOD_SET.has(method)
    ? (method as (typeof HTTP_METHOD_VALUES)[number])
    : "GET";
}

function normalizePostmanPairs(value: unknown): z.infer<typeof keyValueSchema>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const pairs: z.infer<typeof keyValueSchema>[] = [];

  value.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }

    const key = readText(entry.key);
    if (!key) {
      return;
    }

    const type = readText(entry.type).toLowerCase();
    const src = entry.src;
    const fromSrc = Array.isArray(src)
      ? readRawText(src[0] ?? "")
      : readRawText(src);

    const rawValue = type === "file" ? fromSrc : readRawText(entry.value);

    pairs.push({
      key,
      value: rawValue,
      enabled: entry.disabled !== true,
    });
  });

  return pairs;
}

function normalizePostmanVariables(value: unknown): ImportEnvironment["variables"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const variables: ImportEnvironment["variables"] = [];

  value.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }

    const key = readText(entry.key);
    if (!key) {
      return;
    }

    variables.push({
      key,
      value: readRawText(entry.value),
    });
  });

  return variables;
}

function normalizePostmanUrl(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!isRecord(value)) {
    return "";
  }

  const raw = readRawText(value.raw).trim();
  if (raw) {
    return raw;
  }

  const protocol = readText(value.protocol) || "https";

  const host = Array.isArray(value.host)
    ? value.host.map((part) => readText(part)).filter(Boolean).join(".")
    : readText(value.host);

  const path = Array.isArray(value.path)
    ? value.path.map((part) => readText(part)).filter(Boolean).join("/")
    : readText(value.path).replace(/^\/+/, "");

  const query = Array.isArray(value.query)
    ? value.query
        .filter((entry) => isRecord(entry) && readText(entry.key) && entry.disabled !== true)
        .map((entry) => {
          const item = entry as Record<string, unknown>;
          return `${encodeURIComponent(readText(item.key))}=${encodeURIComponent(readRawText(item.value))}`;
        })
        .join("&")
    : "";

  if (!host) {
    return "";
  }

  const pathPart = path ? `/${path}` : "";
  const queryPart = query ? `?${query}` : "";
  return `${protocol}://${host}${pathPart}${queryPart}`;
}

function toKeyValueMap(value: unknown): Record<string, string> {
  const map: Record<string, string> = {};

  if (!Array.isArray(value)) {
    return map;
  }

  value.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }

    const key = readText(entry.key);
    if (!key) {
      return;
    }

    map[key] = readRawText(entry.value);
  });

  return map;
}

function normalizePostmanAuth(value: unknown): z.infer<typeof requestAuthSchema> {
  const defaults = createDefaultAuthConfig();
  if (!isRecord(value)) {
    return defaults;
  }

  const type = readText(value.type).toLowerCase();

  if (type === "basic") {
    const map = toKeyValueMap(value.basic);
    return {
      ...defaults,
      type: "basic",
      basic: {
        username: map.username ?? "",
        password: map.password ?? "",
      },
    };
  }

  if (type === "bearer") {
    const map = toKeyValueMap(value.bearer);
    return {
      ...defaults,
      type: "bearer",
      bearerToken: map.token ?? "",
    };
  }

  if (type === "apikey") {
    const map = toKeyValueMap(value.apikey);
    const addTo = (map.in ?? "header").toLowerCase() === "query" ? "query" : "header";
    return {
      ...defaults,
      type: "api-key",
      apiKey: {
        key: map.key ?? "",
        value: map.value ?? "",
        addTo,
      },
    };
  }

  return defaults;
}

function normalizePostmanBody(
  value: unknown,
  method: (typeof HTTP_METHOD_VALUES)[number],
): {
  bodyMode: z.infer<typeof importRequestSchema>["bodyMode"];
  bodyRaw: string;
  bodyForm: z.infer<typeof keyValueSchema>[];
} {
  if (method === "GET" || method === "HEAD") {
    return {
      bodyMode: "none",
      bodyRaw: "",
      bodyForm: [],
    };
  }

  if (!isRecord(value)) {
    return {
      bodyMode: "none",
      bodyRaw: "",
      bodyForm: [],
    };
  }

  const mode = readText(value.mode).toLowerCase();

  if (mode === "raw" || mode === "graphql") {
    return {
      bodyMode: "raw",
      bodyRaw: readRawText(value.raw).slice(0, 500000),
      bodyForm: [],
    };
  }

  if (mode === "formdata") {
    return {
      bodyMode: "form-data",
      bodyRaw: "",
      bodyForm: normalizePostmanPairs(value.formdata),
    };
  }

  if (mode === "urlencoded") {
    return {
      bodyMode: "x-www-form-urlencoded",
      bodyRaw: "",
      bodyForm: normalizePostmanPairs(value.urlencoded),
    };
  }

  return {
    bodyMode: "none",
    bodyRaw: "",
    bodyForm: [],
  };
}

function toImportDataFromSharedPayload(source: Record<string, unknown>): ImportData | null {
  if (!isRecord(source.collection)) {
    return null;
  }

  const collectionRecord = source.collection;
  const collectionId = readText(collectionRecord.id) || `collection-${randomUUID()}`;
  const collectionName = readText(collectionRecord.name) || "Imported Collection";

  const collections: ImportCollection[] = [
    {
      id: collectionId,
      name: collectionName,
      description: readDescription(collectionRecord.description),
      environmentId: null,
    },
  ];

  const folders: ImportFolder[] = Array.isArray(source.folders)
    ? source.folders
        .filter(isRecord)
        .map((folder, index) => ({
          id: readText(folder.id) || `folder-${index + 1}-${randomUUID()}`,
          collectionId:
            readText(folder.collectionId ?? folder.collection_id) || collectionId,
          parentId: readText(folder.parentId ?? folder.parent_id) || null,
          name: readText(folder.name) || `Folder ${index + 1}`,
          description: readDescription(folder.description),
        }))
    : [];

  const requests: ImportRequest[] = Array.isArray(source.requests)
    ? source.requests
        .filter(isRecord)
        .map((requestEntry, index) => {
          const method = normalizeHttpMethod(requestEntry.method);
          const bodyMode = normalizeBodyMode(requestEntry.bodyMode, method);
          const bodyRaw = readRawText(requestEntry.bodyRaw ?? requestEntry.body).slice(0, 500000);
          const bodyForm = normalizeBodyForm(
            normalizePostmanPairs(requestEntry.bodyForm ?? requestEntry.body_form),
          );

          return {
            id: readText(requestEntry.id) || `request-${index + 1}-${randomUUID()}`,
            collectionId:
              readText(requestEntry.collectionId ?? requestEntry.collection_id) || collectionId,
            folderId: readText(requestEntry.folderId ?? requestEntry.folder_id) || null,
            name: readText(requestEntry.name) || `Request ${index + 1}`,
            description: readDescription(requestEntry.description),
            method,
            url: readRawText(requestEntry.url).trim() || "https://example.com",
            headers: normalizePostmanPairs(requestEntry.headers),
            bodyMode,
            bodyRaw,
            bodyForm,
            auth: normalizeAuthConfig(requestEntry.auth ?? createDefaultAuthConfig()),
            body: bodyRaw,
          };
        })
    : [];

  const environments: ImportEnvironment[] = Array.isArray(source.environments)
    ? source.environments
        .filter(isRecord)
        .map((environment, index) => ({
          id: readText(environment.id) || `env-${index + 1}-${randomUUID()}`,
          name: readText(environment.name) || `Environment ${index + 1}`,
          is_default: environment.is_default === true,
          variables: normalizePostmanVariables(environment.variables),
        }))
    : [];

  return {
    schemaVersion: 1,
    collections,
    folders,
    requests,
    environments,
  };
}

function toImportDataFromPostman(source: Record<string, unknown>): ImportData | null {
  if (!isRecord(source.info) || !Array.isArray(source.item)) {
    return null;
  }

  const collectionName = readText(source.info.name) || "Imported Collection";
  const collectionDescription = readDescription(source.info.description);
  const collectionId = `collection-${randomUUID()}`;

  const variables = normalizePostmanVariables(source.variable);
  const environments: ImportEnvironment[] = [];
  let environmentId: string | null = null;

  if (variables.length > 0) {
    environmentId = `env-${randomUUID()}`;
    environments.push({
      id: environmentId,
      name: `${collectionName} Environment`,
      is_default: false,
      variables,
    });
  }

  const collections: ImportCollection[] = [
    {
      id: collectionId,
      name: collectionName,
      description: collectionDescription,
      environmentId,
    },
  ];

  const folders: ImportFolder[] = [];
  const requests: ImportRequest[] = [];

  const walkItems = (items: unknown[], parentId: string | null) => {
    items.forEach((entry, index) => {
      if (!isRecord(entry)) {
        return;
      }

      const nestedItems = Array.isArray(entry.item) ? entry.item : null;
      const requestRecord = isRecord(entry.request) ? entry.request : null;
      const name = readText(entry.name) || `Item ${index + 1}`;
      const description = readDescription(entry.description);

      if (nestedItems && !requestRecord) {
        const folderId = `folder-${randomUUID()}`;
        folders.push({
          id: folderId,
          collectionId,
          parentId,
          name,
          description,
        });
        walkItems(nestedItems, folderId);
        return;
      }

      if (!requestRecord) {
        return;
      }

      const method = normalizeHttpMethod(requestRecord.method);
      const body = normalizePostmanBody(requestRecord.body, method);

      requests.push({
        id: `request-${randomUUID()}`,
        collectionId,
        folderId: parentId,
        name,
        description: description || readDescription(requestRecord.description),
        method,
        url: normalizePostmanUrl(requestRecord.url) || "https://example.com",
        headers: normalizePostmanPairs(requestRecord.header),
        bodyMode: body.bodyMode,
        bodyRaw: body.bodyRaw,
        bodyForm: body.bodyForm,
        auth: normalizePostmanAuth(requestRecord.auth ?? entry.auth),
        body: body.bodyRaw,
      });
    });
  };

  walkItems(source.item, null);

  return {
    schemaVersion: 1,
    collections,
    folders,
    requests,
    environments,
  };
}

function normalizeImportData(source: unknown): ImportData {
  if (!isRecord(source)) {
    return EMPTY_IMPORT_DATA;
  }

  const hasNativeKeys =
    Object.prototype.hasOwnProperty.call(source, "collections") ||
    Object.prototype.hasOwnProperty.call(source, "folders") ||
    Object.prototype.hasOwnProperty.call(source, "requests") ||
    Object.prototype.hasOwnProperty.call(source, "environments");

  if (hasNativeKeys) {
    const nativeParsed = importDataSchema.safeParse(source);
    return nativeParsed.success ? nativeParsed.data : EMPTY_IMPORT_DATA;
  }

  const shared = toImportDataFromSharedPayload(source);
  if (shared) {
    return shared;
  }

  const postman = toImportDataFromPostman(source);
  if (postman) {
    return postman;
  }

  return EMPTY_IMPORT_DATA;
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  if (context.role !== "Admin") {
    return apiError("Forbidden.", 403);
  }

  try {
    const payload = await readJsonBody(request);
    const envelope = importEnvelopeSchema.safeParse(payload);

    if (!envelope.success) {
      return apiError("Invalid import payload.", 422);
    }

    const normalizedData = normalizeImportData(envelope.data.data);
    const parsedData = importDataSchema.safeParse(normalizedData);

    if (!parsedData.success) {
      return apiError("Invalid import payload.", 422);
    }

    const hasImportableData =
      parsedData.data.collections.length > 0 ||
      parsedData.data.folders.length > 0 ||
      parsedData.data.requests.length > 0 ||
      parsedData.data.environments.length > 0;

    if (!hasImportableData) {
      return apiError(
        "Import payload does not contain collections, folders, requests, or environments.",
        422,
      );
    }

    await connectToDatabase();

    if (envelope.data.mode === "replace") {
      await Promise.all([
        CollectionModel.deleteMany({ tenant_id: context.tenantId, workspace_id: context.workspaceId }),
        DocumentationFolderModel.deleteMany({ tenant_id: context.tenantId, workspace_id: context.workspaceId }),
        SavedRequestModel.deleteMany({ tenant_id: context.tenantId, workspace_id: context.workspaceId }),
        EnvironmentModel.deleteMany({ tenant_id: context.tenantId, workspace_id: context.workspaceId }),
        RequestHistoryModel.deleteMany({ tenant_id: context.tenantId, workspace_id: context.workspaceId }),
      ]);
    }

    const [existingCollections, existingFolders, existingEnvironments] = await Promise.all([
      CollectionModel.find({ tenant_id: context.tenantId, workspace_id: context.workspaceId }).select({ name: 1 }).lean(),
      DocumentationFolderModel.find({ tenant_id: context.tenantId, workspace_id: context.workspaceId })
        .select({ name: 1, parent_id: 1, collection_id: 1 })
        .lean(),
      EnvironmentModel.find({ tenant_id: context.tenantId, workspace_id: context.workspaceId })
        .select({ name: 1, is_default: 1 })
        .lean(),
    ]);

    const usedCollectionNames = new Set(
      existingCollections.map((item) => item.name.toLowerCase()),
    );

    const usedFolderKeys = new Set(
      existingFolders.map(
        (item) => `${item.collection_id?.toString() ?? "none"}::${item.parent_id?.toString() ?? "root"}::${item.name.toLowerCase()}`,
      ),
    );

    const usedEnvironmentNames = new Set(
      existingEnvironments.map((item) => item.name.toLowerCase()),
    );

    const collectionIdMap = new Map<string, Types.ObjectId>();
    const folderIdMap = new Map<string, Types.ObjectId>();
    const folderCollectionMap = new Map<string, Types.ObjectId | null>();
    const environmentIdMap = new Map<string, Types.ObjectId>();

    let defaultEnvironmentAssigned = existingEnvironments.some((item) => item.is_default);

    for (const environment of parsedData.data.environments) {
      const newId = new Types.ObjectId();
      const sourceId = environment.id ?? newId.toString();
      const name = ensureUniqueName(environment.name, usedEnvironmentNames);
      const shouldBeDefault = environment.is_default && !defaultEnvironmentAssigned;

      if (shouldBeDefault) {
        defaultEnvironmentAssigned = true;
      }

      await EnvironmentModel.create({
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        name,
        is_default: shouldBeDefault,
        variables: environment.variables,
      });

      environmentIdMap.set(sourceId, newId);
    }

    for (const collection of parsedData.data.collections) {
      const newId = new Types.ObjectId();
      const sourceId = collection.id ?? newId.toString();
      const name = ensureUniqueName(collection.name, usedCollectionNames);
      const mappedEnvironmentId = collection.environmentId
        ? environmentIdMap.get(collection.environmentId) ?? null
        : null;

      await CollectionModel.create({
        _id: newId,
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        name,
        description: collection.description,
        environment_id: mappedEnvironmentId,
        created_by: new Types.ObjectId(context.userId),
      });

      collectionIdMap.set(sourceId, newId);
    }

    const pendingFolders = [...parsedData.data.folders];

    while (pendingFolders.length > 0) {
      let processedInRound = 0;

      for (let index = pendingFolders.length - 1; index >= 0; index -= 1) {
        const folder = pendingFolders[index];
        const sourceId = folder.id ?? `generated-${index}-${folder.name}`;

        const sourceParentId = folder.parentId ?? null;
        let resolvedParentId: Types.ObjectId | null = null;
        let resolvedCollectionId: Types.ObjectId | null = folder.collectionId
          ? collectionIdMap.get(folder.collectionId) ?? null
          : null;

        if (sourceParentId) {
          const mappedParent = folderIdMap.get(sourceParentId);
          const existsInPending = pendingFolders.some(
            (item) => (item.id ?? null) === sourceParentId,
          );

          if (!mappedParent && existsInPending) {
            continue;
          }

          resolvedParentId = mappedParent ?? null;

          if (resolvedParentId) {
            resolvedCollectionId = folderCollectionMap.get(sourceParentId) ?? resolvedCollectionId;
          }
        }

        const folderKey = `${resolvedCollectionId?.toString() ?? "none"}::${resolvedParentId?.toString() ?? "root"}::${folder.name.toLowerCase()}`;
        if (usedFolderKeys.has(folderKey)) {
          pendingFolders.splice(index, 1);
          processedInRound += 1;
          continue;
        }

        const createdId = new Types.ObjectId();

        await DocumentationFolderModel.create({
          _id: createdId,
          tenant_id: context.tenantId,
          workspace_id: context.workspaceId,
          collection_id: resolvedCollectionId,
          parent_id: resolvedParentId,
          name: folder.name,
          description: folder.description,
          created_by: new Types.ObjectId(context.userId),
        });

        usedFolderKeys.add(folderKey);
        folderIdMap.set(sourceId, createdId);
        folderCollectionMap.set(sourceId, resolvedCollectionId);
        pendingFolders.splice(index, 1);
        processedInRound += 1;
      }

      if (processedInRound === 0) {
        break;
      }
    }

    for (const requestEntry of parsedData.data.requests) {
      const mappedFolderId = requestEntry.folderId
        ? folderIdMap.get(requestEntry.folderId) ?? null
        : null;

      const mappedCollectionIdFromFolder = requestEntry.folderId
        ? folderCollectionMap.get(requestEntry.folderId) ?? null
        : null;

      const mappedCollectionId = requestEntry.collectionId
        ? collectionIdMap.get(requestEntry.collectionId) ?? null
        : mappedCollectionIdFromFolder;

      const bodyMode = normalizeBodyMode(requestEntry.bodyMode, requestEntry.method);
      const bodyRaw = (requestEntry.bodyRaw ?? requestEntry.body ?? "").slice(0, 500000);
      const bodyForm = normalizeBodyForm(requestEntry.bodyForm);
      const auth = normalizeAuthConfig(requestEntry.auth ?? createDefaultAuthConfig());

      await SavedRequestModel.create({
        _id: new Types.ObjectId(),
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        collection_id: mappedCollectionId,
        folder_id: mappedFolderId,
        created_by: new Types.ObjectId(context.userId),
        name: requestEntry.name,
        description: requestEntry.description,
        method: requestEntry.method,
        url: requestEntry.url,
        headers: normalizeHeaders(requestEntry.headers),
        body_mode: bodyMode,
        body_raw: bodyMode === "raw" ? bodyRaw : "",
        body_form:
          bodyMode === "form-data" || bodyMode === "x-www-form-urlencoded"
            ? bodyForm
            : [],
        auth,
        body: bodyMode === "raw" ? bodyRaw : "",
      });
    }

    return NextResponse.json({
      ok: true,
      imported: {
        collections: parsedData.data.collections.length,
        folders: parsedData.data.folders.length,
        requests: parsedData.data.requests.length,
        environments: parsedData.data.environments.length,
      },
      mode: envelope.data.mode,
    });
  } catch (error) {
    return apiException(error);
  }
}
