import {
  CollectionDto,
  DocumentationFolderDto,
  EnvironmentDto,
  HttpMethod,
  KeyValuePair,
  RequestAuthConfig,
  RequestBodyMode,
  RequestDto,
  UserRole,
} from "@/types";

import { BuilderState } from "./types";

export const methods: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export const bodyModes: RequestBodyMode[] = [
  "none",
  "raw",
  "form-data",
  "x-www-form-urlencoded",
];

export const authTypes: RequestAuthConfig["type"][] = [
  "none",
  "basic",
  "bearer",
  "api-key",
];

export const authTypesWithInherit: RequestAuthConfig["type"][] = [
  "inherit",
  "none",
  "basic",
  "bearer",
  "api-key",
];

export const NO_COLLECTION_KEY = "__no_collection__";
export const ROOT_NODE_KEY = "__root__";

const TREE_INDENT_BASE_REM = 0.35;
const TREE_INDENT_STEP_REM = 0.75;

export function treeIndent(depth: number): string {
  return `${TREE_INDENT_BASE_REM + depth * TREE_INDENT_STEP_REM}rem`;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "var(--method-get)",
  POST: "var(--method-post)",
  PUT: "var(--method-put)",
  PATCH: "var(--method-patch)",
  DELETE: "var(--method-delete)",
  HEAD: "var(--method-head)",
  OPTIONS: "var(--method-options)",
};

export function getMethodColor(method: string): string {
  return METHOD_COLORS[method.toUpperCase()] ?? "var(--primary)";
}

export function createDefaultAuth(): RequestAuthConfig {
  return {
    type: "none",
    basic: {
      username: "",
      password: "",
    },
    bearerToken: "",
    apiKey: {
      key: "",
      value: "",
      addTo: "header",
    },
  };
}

export function createInheritAuth(): RequestAuthConfig {
  return {
    type: "inherit",
    basic: {
      username: "",
      password: "",
    },
    bearerToken: "",
    apiKey: {
      key: "",
      value: "",
      addTo: "header",
    },
  };
}

export function createEmptyBuilder(
  collectionId: string | null = null,
  folderId: string | null = null,
): BuilderState {
  return {
    id: null,
    name: "",
    description: "",
    method: "GET",
    url: "",
    queryParams: [],
    headers: [{ key: "Content-Type", value: "application/json", enabled: true }],
    bodyMode: "raw",
    bodyRaw: "{\n  \n}",
    bodyForm: [],
    auth: collectionId || folderId ? createInheritAuth() : createDefaultAuth(),
    collectionId,
    folderId,
  };
}

export interface AuthOwnerRef {
  type: "collection" | "folder";
  id: string;
  name: string;
}

export function resolveEffectiveAuth(
  folderId: string | null,
  collectionId: string | null,
  folders: DocumentationFolderDto[],
  collections: CollectionDto[],
): { auth: RequestAuthConfig; owner: AuthOwnerRef | null } {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  let currentFolderId = folderId;
  const visited = new Set<string>();

  while (currentFolderId && !visited.has(currentFolderId)) {
    visited.add(currentFolderId);
    const folder = folderById.get(currentFolderId);
    if (!folder) {
      break;
    }

    if (folder.auth && folder.auth.type !== "inherit") {
      return { auth: folder.auth, owner: { type: "folder", id: folder.id, name: folder.name } };
    }

    currentFolderId = folder.parent_id;
  }

  const collection = collections.find((item) => item.id === collectionId);
  if (collection?.auth && collection.auth.type !== "inherit") {
    return {
      auth: collection.auth,
      owner: { type: "collection", id: collection.id, name: collection.name },
    };
  }

  return { auth: createDefaultAuth(), owner: null };
}

export function countCollectionContents(
  collectionId: string,
  folders: DocumentationFolderDto[],
  requests: RequestDto[],
): { folderCount: number; requestCount: number } {
  const folderCount = folders.filter((folder) => folder.collection_id === collectionId).length;
  const requestCount = requests.filter((request) => request.collection_id === collectionId).length;
  return { folderCount, requestCount };
}

export function countFolderContents(
  folderId: string,
  folders: DocumentationFolderDto[],
  requests: RequestDto[],
): { folderCount: number; requestCount: number } {
  const descendantFolderIds = new Set<string>();
  const queue = [folderId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    folders.forEach((folder) => {
      if (folder.parent_id === current && !descendantFolderIds.has(folder.id)) {
        descendantFolderIds.add(folder.id);
        queue.push(folder.id);
      }
    });
  }

  const requestCount = requests.filter(
    (request) =>
      request.folder_id === folderId ||
      (request.folder_id !== null && descendantFolderIds.has(request.folder_id)),
  ).length;

  return { folderCount: descendantFolderIds.size, requestCount };
}

export function getEnvironmentVariableKeys(environment: EnvironmentDto | undefined): string[] {
  if (!environment) {
    return [];
  }

  return environment.variables.map((variable) => variable.key).filter(Boolean);
}

export interface VariableSegment {
  text: string;
  isVariable: boolean;
  variableName?: string;
}

export function splitVariableSegments(text: string): VariableSegment[] {
  const segments: VariableSegment[] = [];
  const regex = /\{\{([^{}]*)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isVariable: false });
    }
    segments.push({ text: match[0], isVariable: true, variableName: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isVariable: false });
  }

  return segments;
}

export interface VariableTokenMatch {
  start: number;
  end: number;
  query: string;
}

export function detectVariableToken(value: string, cursor: number): VariableTokenMatch | null {
  const upToCursor = value.slice(0, cursor);
  const lastOpen = upToCursor.lastIndexOf("{{");
  if (lastOpen === -1) {
    return null;
  }

  const closedBetween = upToCursor.indexOf("}}", lastOpen);
  if (closedBetween !== -1) {
    return null;
  }

  const query = upToCursor.slice(lastOpen + 2);
  if (query.includes("{") || query.includes("}")) {
    return null;
  }

  return { start: lastOpen, end: cursor, query };
}

export function getFolderAncestry(
  folderId: string,
  folders: DocumentationFolderDto[],
): DocumentationFolderDto[] {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: DocumentationFolderDto[] = [];
  let currentId: string | null = folderId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = folderById.get(currentId);
    if (!folder) {
      break;
    }
    chain.unshift(folder);
    currentId = folder.parent_id;
  }

  return chain;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getJsonParseError(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON.";
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function splitUrlAndQuery(url: string): { base: string; query: string } {
  const index = url.indexOf("?");
  if (index === -1) {
    return { base: url, query: "" };
  }

  return { base: url.slice(0, index), query: url.slice(index + 1) };
}

export function parseQueryParamsFromUrl(url: string): KeyValuePair[] {
  const { query } = splitUrlAndQuery(url);
  if (!query.trim()) {
    return [];
  }

  return query
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [rawKey, ...rest] = pair.split("=");
      return {
        key: safeDecode(rawKey ?? ""),
        value: safeDecode(rest.join("=")),
        enabled: true,
      };
    });
}

export function mergeQueryParamsFromUrl(
  url: string,
  previousParams: KeyValuePair[],
): KeyValuePair[] {
  const parsed = parseQueryParamsFromUrl(url);

  return parsed.map((param) => {
    const existing = previousParams.find(
      (item) => item.key === param.key && item.value === param.value,
    );
    return existing ? { ...param, enabled: existing.enabled } : param;
  });
}

export function buildUrlWithQueryParams(url: string, params: KeyValuePair[]): string {
  const { base } = splitUrlAndQuery(url);
  const enabledParams = params.filter((param) => param.enabled !== false && param.key.trim());

  if (enabledParams.length === 0) {
    return base;
  }

  const query = enabledParams
    .map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
    .join("&");

  return `${base}?${query}`;
}

export function normalizeJsonText(value: unknown): string {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

export function canWrite(role: UserRole | undefined): boolean {
  return role === "Admin" || role === "Editor";
}

export function canAdmin(role: UserRole | undefined): boolean {
  return role === "Admin";
}

export function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim()) {
    return maybeError;
  }

  return fallback;
}

export function stripCookieHeaders(headers: KeyValuePair[]): KeyValuePair[] {
  return headers.filter((header) => header.key.trim().toLowerCase() !== "cookie");
}

export function parseCookieHeaderValue(value: string): KeyValuePair[] {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawKey, ...rest] = part.split("=");
      return {
        key: rawKey?.trim() ?? "",
        value: rest.join("=").trim(),
        enabled: true,
      };
    })
    .filter((item) => item.key);
}

export interface JsonToken {
  text: string;
  type: "key" | "string" | "number" | "boolean" | "null" | "plain";
}

const JSON_TOKEN_REGEX =
  /"(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function tokenizeJsonText(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  JSON_TOKEN_REGEX.lastIndex = 0;
  while ((match = JSON_TOKEN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), type: "plain" });
    }

    const full = match[0];
    if (full.startsWith('"')) {
      tokens.push({ text: full, type: match[1] ? "key" : "string" });
    } else if (full === "true" || full === "false") {
      tokens.push({ text: full, type: "boolean" });
    } else if (full === "null") {
      tokens.push({ text: full, type: "null" });
    } else {
      tokens.push({ text: full, type: "number" });
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), type: "plain" });
  }

  return tokens;
}

export interface ParsedResponseCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: string;
  httpOnly: boolean;
  secure: boolean;
}

export function parseSetCookieHeader(raw: string): ParsedResponseCookie {
  const [nameValuePart, ...attributeParts] = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const eqIndex = nameValuePart?.indexOf("=") ?? -1;
  const name = eqIndex >= 0 ? nameValuePart.slice(0, eqIndex).trim() : (nameValuePart ?? "").trim();
  const value = eqIndex >= 0 ? nameValuePart.slice(eqIndex + 1).trim() : "";

  let domain = "";
  let path = "";
  let expires = "";
  let httpOnly = false;
  let secure = false;

  attributeParts.forEach((attribute) => {
    const [rawKey, ...rest] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const attributeValue = rest.join("=").trim();

    if (key === "domain") {
      domain = attributeValue;
    } else if (key === "path") {
      path = attributeValue;
    } else if (key === "expires") {
      expires = attributeValue;
    } else if (key === "max-age" && !expires) {
      expires = `Max-Age=${attributeValue}`;
    } else if (key === "httponly") {
      httpOnly = true;
    } else if (key === "secure") {
      secure = true;
    }
  });

  return {
    name,
    value,
    domain: domain || "-",
    path: path || "/",
    expires: expires || "Session",
    httpOnly,
    secure,
  };
}

export function extractCookiesFromHeaders(headers: KeyValuePair[]): KeyValuePair[] {
  const cookies: KeyValuePair[] = [];

  headers.forEach((header) => {
    if (header.key.trim().toLowerCase() !== "cookie") {
      return;
    }

    cookies.push(...parseCookieHeaderValue(header.value));
  });

  return cookies;
}

export function mergeCookiesIntoHeaders(
  headers: KeyValuePair[],
  cookies: KeyValuePair[],
): KeyValuePair[] {
  const sanitizedHeaders = stripCookieHeaders(headers);
  const cookieValue = cookies
    .filter((cookie) => cookie.enabled !== false && cookie.key.trim())
    .map((cookie) => `${cookie.key.trim()}=${cookie.value.trim()}`)
    .join("; ");

  if (!cookieValue) {
    return sanitizedHeaders;
  }

  return [...sanitizedHeaders, { key: "Cookie", value: cookieValue, enabled: true }];
}
