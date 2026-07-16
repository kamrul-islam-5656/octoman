import {
  CollectionDto,
  DocumentationFolderDto,
  HttpMethod,
  KeyValuePair,
  RequestAuthConfig,
  RequestBodyMode,
  RequestDto,
} from "@/types";

export interface BuilderState {
  id: string | null;
  name: string;
  description: string;
  method: HttpMethod;
  url: string;
  queryParams: KeyValuePair[];
  headers: KeyValuePair[];
  bodyMode: RequestBodyMode;
  bodyRaw: string;
  bodyForm: KeyValuePair[];
  auth: RequestAuthConfig;
  collectionId: string | null;
  folderId: string | null;
}

export interface ExecuteResultState {
  ok: boolean;
  status: number;
  headers: { key: string; value: string }[];
  body: unknown;
  durationMs: number;
  errorCode: string | null;
  error: string | null;
}

export type TreeContextMenuPayload =
  | { type: "collection"; collection: CollectionDto }
  | { type: "folder"; folder: DocumentationFolderDto }
  | { type: "request"; request: RequestDto };

export type TreeContextMenuState = TreeContextMenuPayload & { x: number; y: number };

export type NameModalState =
  | { mode: "create-collection" }
  | { mode: "create-folder"; collectionId: string | null; parentId: string | null }
  | { mode: "rename-collection"; collection: CollectionDto }
  | { mode: "rename-folder"; folder: DocumentationFolderDto }
  | { mode: "rename-request"; request: RequestDto };

export type RequestEditorTabId = "params" | "docs" | "auth" | "headers" | "body" | "scripts";
export type ResponseTabId = "body" | "headers" | "cookies";

export interface RequestTabState {
  tabId: string;
  requestId: string | null;
  builder: BuilderState;
  savedSnapshot: BuilderState;
  requestEditorTab: RequestEditorTabId;
  requestCookies: KeyValuePair[];
  showCookiesEditor: boolean;
  responseTab: ResponseTabId;
  executeResult: ExecuteResultState | null;
  isExecuting: boolean;
  isSavingRequest: boolean;
  isDeletingRequest: boolean;
  scriptDraft: string;
}

export interface DeleteConfirmState {
  type: "collection" | "folder" | "request";
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
}
