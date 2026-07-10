"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { TopBar } from "@/components/layout/TopBar";
import {
  AdminUserDto,
  CollectionDto,
  DocumentationFolderDto,
  EnvironmentDto,
  EnvironmentVariable,
  HistoryDto,
  KeyValuePair,
  OrganizationDto,
  RequestAuthConfig,
  RequestDto,
  WorkspaceDto,
} from "@/types";

import { CollectionOverviewPanel, DetailTabId, DetailViewTarget } from "./workspace/CollectionOverviewPanel";
import { CollectionsTree } from "./workspace/CollectionsTree";
import { DeleteConfirmModal } from "./workspace/DeleteConfirmModal";
import { EnvironmentsPanel } from "./workspace/EnvironmentsPanel";
import { HistoryPanel } from "./workspace/HistoryPanel";
import { NameModal } from "./workspace/NameModal";
import { OrganizationPanel } from "./workspace/OrganizationPanel";
import { RequestEditorPanel } from "./workspace/RequestEditorPanel";
import { ResponsePanel } from "./workspace/ResponsePanel";
import { SidebarIconRail, SidebarTab } from "./workspace/SidebarIconRail";
import { TreeContextMenu } from "./workspace/TreeContextMenu";
import {
  BuilderState,
  DeleteConfirmState,
  ExecuteResultState,
  NameModalState,
  RequestEditorTabId,
  ResponseTabId,
  TreeContextMenuPayload,
  TreeContextMenuState,
} from "./workspace/types";
import {
  AuthOwnerRef,
  canAdmin,
  canWrite,
  clamp,
  createEmptyBuilder,
  createInheritAuth,
  extractCookiesFromHeaders,
  getErrorMessage,
  getEnvironmentVariableKeys,
  getJsonParseError,
  mergeCookiesIntoHeaders,
  normalizeJsonText,
  parseQueryParamsFromUrl,
  resolveEffectiveAuth,
  stripCookieHeaders,
} from "./workspace/utils";
import { WorkspaceControlsPanel } from "./workspace/WorkspaceControlsPanel";

export interface WorkspaceInitialData {
  collections: CollectionDto[];
  requests: RequestDto[];
  environments: EnvironmentDto[];
  history: HistoryDto[];
  folders: DocumentationFolderDto[];
  users: AdminUserDto[];
  organization: OrganizationDto | null;
  workspaces: WorkspaceDto[];
  activeWorkspaceId: string;
}

export function WorkspaceClient({
  initialData,
}: {
  initialData: WorkspaceInitialData;
}) {
  const { data: session } = useSession();

  const role = session?.user?.role;

  const initialEnvironmentId =
    initialData.environments.find((env) => env.is_default)?.id ??
    initialData.environments[0]?.id ??
    "";

  const initialEnvironmentVariables =
    initialData.environments.find((env) => env.id === initialEnvironmentId)?.variables ?? [];

  const [collections, setCollections] = useState<CollectionDto[]>(initialData.collections);
  const [requests, setRequests] = useState<RequestDto[]>(initialData.requests);
  const [environments, setEnvironments] = useState<EnvironmentDto[]>(initialData.environments);
  const [history, setHistory] = useState<HistoryDto[]>(initialData.history);
  const [folders, setFolders] = useState<DocumentationFolderDto[]>(initialData.folders);
  const [users, setUsers] = useState<AdminUserDto[]>(initialData.users);
  const [organization, setOrganization] = useState<OrganizationDto | null>(initialData.organization);

  const [collectionFilter, setCollectionFilter] = useState<string>("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [historyScope, setHistoryScope] = useState<"mine" | "tenant">("mine");
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>(initialEnvironmentId);

  const [builder, setBuilder] = useState<BuilderState>(createEmptyBuilder());
  const [environmentVariablesDraft, setEnvironmentVariablesDraft] =
    useState<EnvironmentVariable[]>(initialEnvironmentVariables);

  const [newEnvironmentName, setNewEnvironmentName] = useState("");

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [responsesByRequestId, setResponsesByRequestId] = useState<
    Record<string, ExecuteResultState>
  >({});
  const [draftExecuteResult, setDraftExecuteResult] = useState<ExecuteResultState | null>(null);
  const executeResult = builder.id ? responsesByRequestId[builder.id] ?? null : draftExecuteResult;
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSavingRequest, setIsSavingRequest] = useState(false);
  const [isDeletingRequest, setIsDeletingRequest] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingEnvironment, setIsCreatingEnvironment] = useState(false);
  const [isSavingEnvironmentVariables, setIsSavingEnvironmentVariables] = useState(false);
  const [settingDefaultEnvironmentId, setSettingDefaultEnvironmentId] = useState<string | null>(null);
  const [isNameModalSubmitting, setIsNameModalSubmitting] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("workspace");
  const [requestEditorTab, setRequestEditorTab] = useState<RequestEditorTabId>("docs");
  const [responseTab, setResponseTab] = useState<ResponseTabId>("body");
  const [requestCookies, setRequestCookies] = useState<KeyValuePair[]>([]);
  const [showCookiesEditor, setShowCookiesEditor] = useState(false);
  const [expandedCollectionIds, setExpandedCollectionIds] = useState<Record<string, boolean>>({});
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenuState | null>(null);
  const treeContextMenuRef = useRef<HTMLDivElement | null>(null);

  const [activeDetailView, setActiveDetailView] = useState<
    { type: "collection"; id: string } | { type: "folder"; id: string } | null
  >(null);
  const [detailTab, setDetailTab] = useState<DetailTabId>("overview");

  function openDetailView(
    target: { type: "collection"; id: string } | { type: "folder"; id: string },
    tab: DetailTabId = "overview",
  ) {
    setActiveDetailView(target);
    setDetailTab(tab);
  }

  const SIDEBAR_WIDTH_STORAGE_KEY = "octoman-sidebar-width";
  const SIDEBAR_MIN_WIDTH = 220;
  const SIDEBAR_MAX_WIDTH = 560;
  const SIDEBAR_DEFAULT_WIDTH = 320;

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (!Number.isNaN(parsed)) {
      setSidebarWidth(clamp(parsed, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    setIsDesktopLayout(mediaQuery.matches);
    const handleMediaChange = (event: MediaQueryListEvent) => setIsDesktopLayout(event.matches);
    mediaQuery.addEventListener("change", handleMediaChange);
    return () => mediaQuery.removeEventListener("change", handleMediaChange);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      if (!workspaceGridRef.current) {
        return;
      }
      const rect = workspaceGridRef.current.getBoundingClientRect();
      const nextWidth = clamp(event.clientX - rect.left, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
      setSidebarWidth(nextWidth);
    }

    function handleMouseUp() {
      setIsResizingSidebar(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (isResizingSidebar) {
      return;
    }
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth, isResizingSidebar]);

  useEffect(() => {
    if (!treeContextMenu) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (treeContextMenuRef.current && !treeContextMenuRef.current.contains(event.target as Node)) {
        setTreeContextMenu(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [treeContextMenu]);

  const [nameModal, setNameModal] = useState<NameModalState | null>(null);
  const [nameModalValue, setNameModalValue] = useState("");

  function openNameModal(state: NameModalState, initialValue = "") {
    setNameModal(state);
    setNameModalValue(initialValue);
  }

  function closeNameModal() {
    setNameModal(null);
    setNameModalValue("");
  }

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  const [scriptDraft, setScriptDraft] = useState(
    "// Scripts run support can be connected here.\n// Keep this script for request-related notes.",
  );

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === builder.collectionId) ?? null,
    [builder.collectionId, collections],
  );

  const activeDetailTarget = useMemo<DetailViewTarget | null>(() => {
    if (!activeDetailView) {
      return null;
    }

    if (activeDetailView.type === "collection") {
      const collection = collections.find((item) => item.id === activeDetailView.id);
      return collection ? { type: "collection", collection } : null;
    }

    const folder = folders.find((item) => item.id === activeDetailView.id);
    return folder ? { type: "folder", folder } : null;
  }, [activeDetailView, collections, folders]);

  const environmentVariableKeys = useMemo(
    () => getEnvironmentVariableKeys(environments.find((item) => item.id === selectedEnvironmentId)),
    [environments, selectedEnvironmentId],
  );

  const activeFolderPath = useMemo(() => {
    if (!builder.folderId) {
      return [] as DocumentationFolderDto[];
    }

    const chain: DocumentationFolderDto[] = [];
    const visited = new Set<string>();
    let cursor = folderById.get(builder.folderId) ?? null;

    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parent_id ? folderById.get(cursor.parent_id) ?? null : null;
    }

    return chain;
  }, [builder.folderId, folderById]);

  const requestPathSegments = useMemo(() => {
    const path = [organization?.name ?? "Workspace"];

    if (activeCollection) {
      path.push(activeCollection.name);
    } else {
      path.push("No Collection");
    }

    activeFolderPath.forEach((folder) => {
      path.push(folder.name);
    });

    path.push(builder.name.trim() || "New Request");
    return path;
  }, [activeCollection, activeFolderPath, builder.name, organization]);

  const responseCookieHeaders = useMemo(() => {
    if (!executeResult) {
      return [] as Array<{ key: string; value: string }>;
    }

    return executeResult.headers.filter((header) => {
      const normalized = header.key.trim().toLowerCase();
      return normalized === "set-cookie" || normalized === "cookie";
    });
  }, [executeResult]);

  const responseText = useMemo(() => {
    if (!executeResult) {
      return "No response yet. Execute a request to inspect status, headers, and payload.";
    }

    if (executeResult.error) {
      return executeResult.error;
    }

    return normalizeJsonText(executeResult.body);
  }, [executeResult]);

  const loadCollections = useCallback(async () => {
    const response = await fetch("/api/collections", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: CollectionDto[]; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load collections."));
      return;
    }

    setCollections(payload?.data ?? []);
    setGlobalError(null);
  }, []);

  const loadFolders = useCallback(async () => {
    const response = await fetch("/api/documentation/folders", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: DocumentationFolderDto[]; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load folders."));
      return;
    }

    setFolders(payload?.data ?? []);
    setGlobalError(null);
  }, []);

  const loadRequests = useCallback(
    async (collectionId = collectionFilter, folderId = folderFilter) => {
      const query = new URLSearchParams();

      if (collectionId !== "all") {
        query.set("collectionId", collectionId);
      }

      if (folderId !== "all") {
        query.set("folderId", folderId);
      }

      const suffix = query.size > 0 ? `?${query.toString()}` : "";

      const response = await fetch(`/api/requests${suffix}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { data?: RequestDto[]; error?: string }
        | null;

      if (!response.ok) {
        setGlobalError(getErrorMessage(payload, "Failed to load requests."));
        return;
      }

      setRequests(payload?.data ?? []);
      setGlobalError(null);
    },
    [collectionFilter, folderFilter],
  );

  const loadEnvironments = useCallback(async () => {
    const response = await fetch("/api/environments", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: EnvironmentDto[]; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load environments."));
      return;
    }

    const envs = payload?.data ?? [];
    setEnvironments(envs);

    const stillValid = envs.some((env) => env.id === selectedEnvironmentId);
    const nextSelectedId = stillValid
      ? selectedEnvironmentId
      : (envs.find((env) => env.is_default)?.id ?? envs[0]?.id ?? "");

    setSelectedEnvironmentId(nextSelectedId);
    const nextSelectedEnvironment = envs.find((env) => env.id === nextSelectedId);
    setEnvironmentVariablesDraft(nextSelectedEnvironment?.variables ?? []);
    setGlobalError(null);
  }, [selectedEnvironmentId]);

  const loadHistory = useCallback(
    async (collectionId = collectionFilter, scope = historyScope, folderId = folderFilter) => {
      const query = new URLSearchParams();
      query.set("scope", scope);

      if (collectionId !== "all") {
        query.set("collectionId", collectionId);
      }

      if (folderId !== "all") {
        query.set("folderId", folderId);
      }

      const response = await fetch(`/api/history?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: HistoryDto[]; error?: string }
        | null;

      if (!response.ok) {
        setGlobalError(getErrorMessage(payload, "Failed to load history."));
        return;
      }

      setHistory(payload?.data ?? []);
      setGlobalError(null);
    },
    [collectionFilter, historyScope, folderFilter],
  );

  function expandFolderWithAncestors(folderId: string | null) {
    if (!folderId) {
      return;
    }

    setExpandedFolderIds((previous) => {
      const next = { ...previous };
      let cursor: string | null = folderId;

      while (cursor) {
        next[cursor] = true;
        cursor = folderById.get(cursor)?.parent_id ?? null;
      }

      return next;
    });
  }

  function toggleCollectionExpanded(collectionId: string) {
    setExpandedCollectionIds((previous) => ({
      ...previous,
      [collectionId]: !(previous[collectionId] ?? true),
    }));
  }

  function toggleFolderExpanded(folderId: string) {
    setExpandedFolderIds((previous) => ({
      ...previous,
      [folderId]: !(previous[folderId] ?? true),
    }));
  }

  async function handleSelectCollection(nextCollectionId: string) {
    setCollectionFilter(nextCollectionId);

    if (nextCollectionId !== "all") {
      setExpandedCollectionIds((previous) => ({
        ...previous,
        [nextCollectionId]: true,
      }));
      openDetailView({ type: "collection", id: nextCollectionId });
    } else {
      setActiveDetailView(null);
    }

    setBuilder((previous) => ({
      ...previous,
      collectionId: nextCollectionId === "all" ? null : nextCollectionId,
    }));

    await loadHistory(nextCollectionId, historyScope, folderFilter);
  }

  async function handleSelectFolder(nextFolderId: string) {
    setFolderFilter(nextFolderId);

    if (nextFolderId !== "all") {
      expandFolderWithAncestors(nextFolderId);
      openDetailView({ type: "folder", id: nextFolderId });
    } else {
      setActiveDetailView(null);
    }

    setBuilder((previous) => ({
      ...previous,
      folderId: nextFolderId === "all" ? null : nextFolderId,
    }));

    await loadHistory(collectionFilter, historyScope, nextFolderId);
  }

  async function handleResetWorkspaceFilters() {
    setCollectionFilter("all");
    setFolderFilter("all");
    setBuilder((previous) => ({
      ...previous,
      collectionId: null,
      folderId: null,
    }));

    await Promise.all([loadRequests("all", "all"), loadHistory("all", historyScope, "all")]);
  }

  async function handleSelectHistoryScope(scope: "mine" | "tenant") {
    setHistoryScope(scope);
    await loadHistory(collectionFilter, scope, folderFilter);
  }

  function handleSelectEnvironment(environmentId: string) {
    setSelectedEnvironmentId(environmentId);
    const environment = environments.find((item) => item.id === environmentId);
    setEnvironmentVariablesDraft(environment?.variables ?? []);
  }

  async function createCollectionWithName(name: string) {
    const response = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: "" }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to create collection."));
      return;
    }

    setGlobalError(null);
    await Promise.all([loadCollections(), loadRequests("all", "all")]);
  }

  async function handleCreateEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newEnvironmentName.trim()) {
      return;
    }

    setIsCreatingEnvironment(true);
    try {
      const response = await fetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEnvironmentName,
          is_default: environments.length === 0,
          variables: [{ key: "base_url", value: "https://api.example.com" }],
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setGlobalError(getErrorMessage(payload, "Failed to create environment."));
        return;
      }

      setNewEnvironmentName("");
      await loadEnvironments();
    } finally {
      setIsCreatingEnvironment(false);
    }
  }

  async function handleSaveEnvironmentVariables() {
    if (!selectedEnvironmentId) {
      return;
    }

    setIsSavingEnvironmentVariables(true);
    try {
      const variables = environmentVariablesDraft.filter((item) => item.key.trim());

      const response = await fetch(`/api/environments/${selectedEnvironmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setGlobalError(getErrorMessage(payload, "Failed to save environment variables."));
        return;
      }

      await loadEnvironments();
    } finally {
      setIsSavingEnvironmentVariables(false);
    }
  }

  async function handleSetDefaultEnvironment(environmentId: string) {
    setSettingDefaultEnvironmentId(environmentId);
    try {
      const response = await fetch(`/api/environments/${environmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setGlobalError(getErrorMessage(payload, "Failed to set default environment."));
        return;
      }

      await loadEnvironments();
    } finally {
      setSettingDefaultEnvironmentId(null);
    }
  }

  function setResultForRequest(requestId: string | null, result: ExecuteResultState | null) {
    if (!requestId) {
      setDraftExecuteResult(result);
      return;
    }

    setResponsesByRequestId((previous) => {
      if (result === null) {
        const next = { ...previous };
        delete next[requestId];
        return next;
      }
      return { ...previous, [requestId]: result };
    });
  }

  function startNewRequest() {
    setBuilder(
      createEmptyBuilder(
        collectionFilter !== "all" ? collectionFilter : null,
        folderFilter !== "all" ? folderFilter : null,
      ),
    );
    setActiveRequestId(null);
    setRequestCookies([]);
    setRequestEditorTab("docs");
    setActiveDetailView(null);
    setDraftExecuteResult(null);
  }

  function pickRequest(item: RequestDto) {
    const sanitizedHeaders = stripCookieHeaders(item.headers);
    setActiveDetailView(null);

    if (item.collection_id) {
      setExpandedCollectionIds((previous) => ({
        ...previous,
        [item.collection_id as string]: true,
      }));
    }

    expandFolderWithAncestors(item.folder_id);

    setActiveRequestId(item.id);
    setRequestCookies(extractCookiesFromHeaders(item.headers));
    setBuilder({
      id: item.id,
      name: item.name,
      description: item.description,
      method: item.method,
      url: item.url,
      queryParams: parseQueryParamsFromUrl(item.url),
      headers:
        sanitizedHeaders.length > 0
          ? sanitizedHeaders
          : [{ key: "Content-Type", value: "application/json", enabled: true }],
      bodyMode: item.body_mode,
      bodyRaw: item.body_raw,
      bodyForm: item.body_form,
      auth: item.auth,
      collectionId: item.collection_id,
      folderId: item.folder_id,
    });
    setRequestEditorTab("docs");
  }

  async function handleSaveRequest() {
    if (!builder.name.trim()) {
      setGlobalError("Request name is required before saving.");
      return;
    }

    if (!builder.url.trim()) {
      setGlobalError("URL is required before saving.");
      return;
    }

    if (builder.bodyMode === "raw" && builder.bodyRaw.trim()) {
      const jsonError = getJsonParseError(builder.bodyRaw);
      if (jsonError) {
        setGlobalError(`Invalid JSON body: ${jsonError}`);
        return;
      }
    }

    setIsSavingRequest(true);
    setGlobalError(null);

    const headersWithCookies = mergeCookiesIntoHeaders(builder.headers, requestCookies);

    const payload = {
      name: builder.name,
      description: builder.description,
      method: builder.method,
      url: builder.url,
      headers: headersWithCookies,
      bodyMode: builder.bodyMode,
      bodyRaw: builder.bodyRaw,
      bodyForm: builder.bodyForm,
      auth: builder.auth,
      body: builder.bodyRaw,
      collectionId: builder.collectionId,
      folderId: builder.folderId,
    };

    const endpoint = builder.id ? `/api/requests/${builder.id}` : "/api/requests";
    const method = builder.id ? "PATCH" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSavingRequest(false);

    if (!response.ok) {
      const responsePayload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setGlobalError(getErrorMessage(responsePayload, "Failed to save request."));
      return;
    }

    const responsePayload = (await response.json()) as { data?: RequestDto };
    if (responsePayload.data) {
      const newId = responsePayload.data.id;
      setBuilder((previous) => ({ ...previous, id: newId }));
      setActiveRequestId(newId);

      if (!builder.id && draftExecuteResult) {
        setResultForRequest(newId, draftExecuteResult);
        setDraftExecuteResult(null);
      }
    }

    await loadRequests("all", "all");
  }

  async function handleDeleteRequest() {
    if (!builder.id) {
      return;
    }

    setIsDeletingRequest(true);
    try {
      const response = await fetch(`/api/requests/${builder.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setGlobalError(getErrorMessage(payload, "Failed to delete request."));
        return;
      }

      setResultForRequest(builder.id, null);
      setActiveRequestId(null);
      startNewRequest();
      await loadRequests("all", "all");
    } finally {
      setIsDeletingRequest(false);
    }
  }

  async function handleExecuteRequest() {
    if (!builder.url.trim()) {
      setGlobalError("URL is required before executing request.");
      return;
    }

    const requestKey = builder.id;

    if (builder.bodyMode === "raw" && builder.bodyRaw.trim()) {
      const jsonError = getJsonParseError(builder.bodyRaw);
      if (jsonError) {
        setResultForRequest(requestKey, {
          ok: false,
          status: 400,
          headers: [],
          body: {
            success: false,
            message: jsonError,
            errorSources: [],
            err: null,
            stack: null,
          },
          durationMs: 0,
          errorCode: "INVALID_JSON_BODY",
          error: null,
        });
        setGlobalError(`Invalid JSON body: ${jsonError}`);
        return;
      }
    }

    setIsExecuting(true);
    setGlobalError(null);
    setResultForRequest(requestKey, null);

    const headersWithCookies = mergeCookiesIntoHeaders(builder.headers, requestCookies);
    const effectiveAuth =
      builder.auth.type === "inherit"
        ? resolveEffectiveAuth(builder.folderId, builder.collectionId, folders, collections).auth
        : builder.auth;

    const response = await fetch("/api/tester/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: builder.id,
        collectionId: builder.collectionId,
        folderId: builder.folderId,
        environmentId: selectedEnvironmentId || null,
        method: builder.method,
        url: builder.url,
        headers: headersWithCookies,
        bodyMode: builder.bodyMode,
        bodyRaw: builder.bodyRaw,
        bodyForm: builder.bodyForm,
        auth: effectiveAuth,
        body: builder.bodyRaw,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          status?: number;
          headers?: { key: string; value: string }[];
          body?: unknown;
          durationMs?: number;
          errorCode?: string | null;
          error?: string;
        }
      | null;

    setIsExecuting(false);

    setResultForRequest(requestKey, {
      ok: Boolean(payload?.ok),
      status: payload?.status ?? 0,
      headers: payload?.headers ?? [],
      body: payload?.body ?? null,
      durationMs: payload?.durationMs ?? 0,
      errorCode: payload?.errorCode ?? null,
      error: payload?.error ?? (response.ok ? null : "Execution failed."),
    });

    if (!response.ok && payload?.error) {
      setGlobalError(payload.error);
    }

    await Promise.all([
      loadHistory(collectionFilter, historyScope, folderFilter),
      loadRequests("all", "all"),
    ]);
  }

  function applyHistoryEntry(entry: HistoryDto) {
    const sanitizedHeaders = stripCookieHeaders(entry.headers);

    setBuilder((previous) => ({
      ...previous,
      id: null,
      name: `${entry.method} ${entry.url}`,
      method: entry.method,
      url: entry.url,
      queryParams: parseQueryParamsFromUrl(entry.url),
      headers:
        sanitizedHeaders.length > 0
          ? sanitizedHeaders
          : [{ key: "Content-Type", value: "application/json", enabled: true }],
      bodyMode: entry.body_mode,
      bodyRaw: entry.body_raw,
      bodyForm: entry.body_form,
      auth: entry.auth,
      collectionId: entry.collection_id,
      folderId: entry.folder_id,
    }));
    setRequestCookies(extractCookiesFromHeaders(entry.headers));
    setActiveRequestId(null);
    setRequestEditorTab("docs");
    setDraftExecuteResult(null);
  }

  function copyName(name: string): string {
    return `${name} Copy`;
  }

  async function refreshTree() {
    await Promise.all([loadCollections(), loadFolders(), loadRequests("all", "all")]);
  }

  async function createFolderWithName(
    name: string,
    collectionId: string | null,
    parentId: string | null,
  ) {
    const response = await fetch("/api/documentation/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, collectionId, parentId }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to create folder."));
      return;
    }

    if (collectionId) {
      setExpandedCollectionIds((previous) => ({ ...previous, [collectionId]: true }));
    }
    if (parentId) {
      expandFolderWithAncestors(parentId);
    }

    setGlobalError(null);
    await loadFolders();
  }

  function handleCreateFolderIn(collectionId: string | null, parentId: string | null) {
    if (isReadonly) {
      return;
    }

    openNameModal({ mode: "create-folder", collectionId, parentId });
  }

  async function handleCreateRequestIn(collectionId: string | null, folderId: string | null) {
    if (isReadonly) {
      return;
    }

    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Request",
        method: "GET",
        url: "https://",
        collectionId,
        folderId,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to create request."));
      return;
    }

    const payload = (await response.json()) as { data?: RequestDto };

    if (collectionId) {
      setExpandedCollectionIds((previous) => ({ ...previous, [collectionId]: true }));
    }
    if (folderId) {
      expandFolderWithAncestors(folderId);
    }

    setGlobalError(null);
    await loadRequests("all", "all");

    if (payload.data) {
      pickRequest(payload.data);
    }
  }

  async function renameCollectionWithName(collection: CollectionDto, name: string) {
    const response = await fetch(`/api/collections/${collection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to rename collection."));
      return;
    }

    setGlobalError(null);
    await loadCollections();
  }

  function handleRenameCollectionItem(collection: CollectionDto) {
    if (isReadonly) {
      return;
    }

    openNameModal({ mode: "rename-collection", collection }, collection.name);
  }

  async function renameFolderWithName(folder: DocumentationFolderDto, name: string) {
    const response = await fetch(`/api/documentation/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to rename folder."));
      return;
    }

    setGlobalError(null);
    await loadFolders();
  }

  function handleRenameFolderItem(folder: DocumentationFolderDto) {
    if (isReadonly) {
      return;
    }

    openNameModal({ mode: "rename-folder", folder }, folder.name);
  }

  async function handleUpdateCollectionDescription(collectionId: string, description: string) {
    const response = await fetch(`/api/collections/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to update collection description."));
      return;
    }

    const payload = (await response.json()) as { data?: CollectionDto };
    if (payload.data) {
      setCollections((previous) =>
        previous.map((item) => (item.id === collectionId ? (payload.data as CollectionDto) : item)),
      );
    }
    setGlobalError(null);
  }

  async function handleUpdateCollectionAuth(collectionId: string, auth: RequestAuthConfig) {
    const response = await fetch(`/api/collections/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to update collection authorization."));
      return;
    }

    const payload = (await response.json()) as { data?: CollectionDto };
    if (payload.data) {
      setCollections((previous) =>
        previous.map((item) => (item.id === collectionId ? (payload.data as CollectionDto) : item)),
      );
    }
    setGlobalError(null);
  }

  async function handleUpdateFolderDescription(folderId: string, description: string) {
    const response = await fetch(`/api/documentation/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to update folder description."));
      return;
    }

    const payload = (await response.json()) as { data?: DocumentationFolderDto };
    if (payload.data) {
      setFolders((previous) =>
        previous.map((item) => (item.id === folderId ? (payload.data as DocumentationFolderDto) : item)),
      );
    }
    setGlobalError(null);
  }

  async function handleUpdateFolderAuth(folderId: string, auth: RequestAuthConfig) {
    const response = await fetch(`/api/documentation/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to update folder authorization."));
      return;
    }

    const payload = (await response.json()) as { data?: DocumentationFolderDto };
    if (payload.data) {
      setFolders((previous) =>
        previous.map((item) => (item.id === folderId ? (payload.data as DocumentationFolderDto) : item)),
      );
    }

    if (auth.type === "inherit") {
      await cascadeInheritAuthToFolderRequests(folderId);
    }

    setGlobalError(null);
  }

  async function cascadeInheritAuthToFolderRequests(folderId: string) {
    const childRequests = requests.filter((item) => item.folder_id === folderId);
    if (childRequests.length === 0) {
      return;
    }

    const inheritAuth = createInheritAuth();

    await Promise.all(
      childRequests.map((item) =>
        fetch(`/api/requests/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auth: inheritAuth }),
        }),
      ),
    );

    await loadRequests("all", "all");

    if (builder.folderId === folderId) {
      setBuilder((previous) => ({ ...previous, auth: inheritAuth }));
    }
  }

  function handleNavigateToAuthOwner(owner: AuthOwnerRef) {
    openDetailView({ type: owner.type, id: owner.id }, "authorization");
  }

  async function renameRequestWithName(request: RequestDto, name: string) {
    const response = await fetch(`/api/requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to rename request."));
      return;
    }

    if (builder.id === request.id) {
      setBuilder((previous) => ({ ...previous, name }));
    }

    setGlobalError(null);
    await loadRequests("all", "all");
  }

  function handleRenameRequestItem(request: RequestDto) {
    if (isReadonly) {
      return;
    }

    openNameModal({ mode: "rename-request", request }, request.name);
  }

  async function submitNameModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nameModal) {
      return;
    }

    const name = nameModalValue.trim();
    if (!name) {
      return;
    }

    setIsNameModalSubmitting(true);
    try {
      if (nameModal.mode === "create-collection") {
        await createCollectionWithName(name);
      } else if (nameModal.mode === "create-folder") {
        await createFolderWithName(name, nameModal.collectionId, nameModal.parentId);
      } else if (nameModal.mode === "rename-collection") {
        await renameCollectionWithName(nameModal.collection, name);
      } else if (nameModal.mode === "rename-folder") {
        await renameFolderWithName(nameModal.folder, name);
      } else if (nameModal.mode === "rename-request") {
        await renameRequestWithName(nameModal.request, name);
      }

      closeNameModal();
    } finally {
      setIsNameModalSubmitting(false);
    }
  }

  async function performDeleteCollection(collection: CollectionDto) {
    const response = await fetch(`/api/collections/${collection.id}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to delete collection."));
      return;
    }

    if (builder.collectionId === collection.id) {
      startNewRequest();
      setActiveRequestId(null);
    }

    if (collectionFilter === collection.id) {
      setCollectionFilter("all");
      setFolderFilter("all");
    }

    setGlobalError(null);
    await refreshTree();
  }

  async function performDeleteFolder(folder: DocumentationFolderDto) {
    const response = await fetch(`/api/documentation/folders/${folder.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to delete folder."));
      return;
    }

    if (builder.folderId === folder.id) {
      setBuilder((previous) => ({ ...previous, folderId: null }));
    }

    if (folderFilter === folder.id) {
      setFolderFilter("all");
    }

    setGlobalError(null);
    await Promise.all([loadFolders(), loadRequests("all", "all")]);
  }

  async function performDeleteRequest(request: RequestDto) {
    const response = await fetch(`/api/requests/${request.id}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to delete request."));
      return;
    }

    if (activeRequestId === request.id) {
      setActiveRequestId(null);
      startNewRequest();
    }

    setGlobalError(null);
    await loadRequests("all", "all");
  }

  function handleDeleteCollectionItem(collection: CollectionDto) {
    if (isReadonly) {
      return;
    }

    setDeleteConfirm({
      type: "collection",
      title: "Delete collection",
      message: `Delete collection "${collection.name}" and everything inside it? This cannot be undone.`,
      onConfirm: () => performDeleteCollection(collection),
    });
  }

  function handleDeleteFolderItem(folder: DocumentationFolderDto) {
    if (isReadonly) {
      return;
    }

    setDeleteConfirm({
      type: "folder",
      title: "Delete folder",
      message: `Delete folder "${folder.name}" and everything inside it?`,
      onConfirm: () => performDeleteFolder(folder),
    });
  }

  function handleDeleteRequestItem(request: RequestDto) {
    if (isReadonly) {
      return;
    }

    setDeleteConfirm({
      type: "request",
      title: "Delete request",
      message: `Delete request "${request.name}"?`,
      onConfirm: () => performDeleteRequest(request),
    });
  }

  async function confirmDelete() {
    if (!deleteConfirm) {
      return;
    }

    setIsDeleteConfirming(true);
    try {
      await deleteConfirm.onConfirm();
      setDeleteConfirm(null);
    } finally {
      setIsDeleteConfirming(false);
    }
  }

  async function handleDuplicateRequestItem(request: RequestDto) {
    if (isReadonly) {
      return;
    }

    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: copyName(request.name),
        description: request.description,
        method: request.method,
        url: request.url,
        headers: request.headers,
        bodyMode: request.body_mode,
        bodyRaw: request.body_raw,
        bodyForm: request.body_form,
        auth: request.auth,
        collectionId: request.collection_id,
        folderId: request.folder_id,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to duplicate request."));
      return;
    }

    setGlobalError(null);
    await loadRequests("all", "all");
  }

  async function duplicateRequestsInto(
    sourceCollectionId: string | null,
    sourceFolderId: string | null,
    targetCollectionId: string | null,
    targetFolderId: string | null,
  ) {
    const toDuplicate = requests.filter(
      (item) =>
        (item.collection_id ?? null) === sourceCollectionId &&
        (item.folder_id ?? null) === sourceFolderId,
    );

    for (const item of toDuplicate) {
      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          description: item.description,
          method: item.method,
          url: item.url,
          headers: item.headers,
          bodyMode: item.body_mode,
          bodyRaw: item.body_raw,
          bodyForm: item.body_form,
          auth: item.auth,
          collectionId: targetCollectionId,
          folderId: targetFolderId,
        }),
      });
    }
  }

  async function duplicateFolderTree(
    folder: DocumentationFolderDto,
    targetCollectionId: string | null,
    targetParentId: string | null,
    nameOverride?: string,
  ) {
    const response = await fetch("/api/documentation/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameOverride ?? folder.name,
        description: folder.description,
        collectionId: targetCollectionId,
        parentId: targetParentId,
      }),
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { data?: DocumentationFolderDto };
    const newFolder = payload.data;
    if (!newFolder) {
      return;
    }

    await duplicateRequestsInto(folder.collection_id, folder.id, targetCollectionId, newFolder.id);

    const childFolders = folders.filter((item) => item.parent_id === folder.id);
    for (const child of childFolders) {
      await duplicateFolderTree(child, targetCollectionId, newFolder.id);
    }
  }

  async function handleDuplicateFolderItem(folder: DocumentationFolderDto) {
    if (isReadonly) {
      return;
    }

    await duplicateFolderTree(folder, folder.collection_id, folder.parent_id, copyName(folder.name));
    setGlobalError(null);
    await refreshTree();
  }

  async function handleDuplicateCollectionItem(collection: CollectionDto) {
    if (isReadonly) {
      return;
    }

    const response = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: copyName(collection.name), description: collection.description }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to duplicate collection."));
      return;
    }

    const payload = (await response.json()) as { data?: CollectionDto };
    const newCollection = payload.data;
    if (!newCollection) {
      return;
    }

    const rootFolders = folders.filter(
      (item) => item.collection_id === collection.id && !item.parent_id,
    );
    for (const rootFolder of rootFolders) {
      await duplicateFolderTree(rootFolder, newCollection.id, null);
    }

    await duplicateRequestsInto(collection.id, null, newCollection.id, null);

    setGlobalError(null);
    await refreshTree();
  }

  function openTreeMenu(
    event: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number },
    payload: TreeContextMenuPayload,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({ x: event.clientX, y: event.clientY, ...payload });
  }

  async function handleExportWorkspaceJson() {
    const response = await fetch("/api/workspace/export", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | {
          data?: unknown;
          error?: string;
        }
      | null;

    if (!response.ok || !payload?.data) {
      setGlobalError(getErrorMessage(payload, "Failed to export workspace JSON."));
      return;
    }

    const blob = new Blob([JSON.stringify(payload.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `octoman-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setGlobalError(null);
  }

  async function handleExportCollection(collection: CollectionDto) {
    const response = await fetch(
      `/api/workspace/export?collectionId=${encodeURIComponent(collection.id)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | {
          data?: unknown;
          error?: string;
        }
      | null;

    if (!response.ok || !payload?.data) {
      setGlobalError(getErrorMessage(payload, "Failed to export collection."));
      return;
    }

    const blob = new Blob([JSON.stringify(payload.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeName = collection.name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "collection";
    link.download = `${safeName}.postman_collection.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setGlobalError(null);
  }

  async function handleImportWorkspaceJson(event: ChangeEvent<HTMLInputElement>) {
    const target = event.currentTarget;
    const file = target.files?.[0];
    target.value = "";

    if (!file) {
      return;
    }

    setIsImporting(true);
    setGlobalError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      const response = await fetch("/api/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "merge",
          data: parsed,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setGlobalError(getErrorMessage(payload, "Failed to import workspace JSON."));
        setIsImporting(false);
        return;
      }

      setCollectionFilter("all");
      setFolderFilter("all");

      await Promise.all([
        loadCollections(),
        loadFolders(),
        loadRequests("all", "all"),
        loadEnvironments(),
        loadHistory("all", historyScope, "all"),
      ]);
      setGlobalError(null);
    } catch {
      setGlobalError("Selected file is not valid JSON.");
    } finally {
      setIsImporting(false);
    }
  }

  const isReadonly = !canWrite(role);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        userName={session?.user?.name ?? "Unknown User"}
        role={role ?? "Viewer"}
        environments={environments}
        selectedEnvironmentId={selectedEnvironmentId}
        onSelectEnvironment={handleSelectEnvironment}
        workspaces={initialData.workspaces}
        activeWorkspaceId={initialData.activeWorkspaceId}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => void handleImportWorkspaceJson(event)}
      />

      {globalError ? (
        <div className="border-b border-red-400/30 bg-red-100/60 px-4 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
          {globalError}
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex h-full shrink-0 overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] p-0">
          <SidebarIconRail activeTab={sidebarTab} onSelectTab={setSidebarTab} showAdmin={canAdmin(role)} />
        </aside>

        {sidebarTab === "admin" ? (
          <div className="h-full flex-1 overflow-auto p-4">
            <OrganizationPanel
              organization={organization}
              setOrganization={setOrganization}
              users={users}
              setUsers={setUsers}
              role={role}
              globalError={globalError}
              setGlobalError={setGlobalError}
            />
          </div>
        ) : (
        <div
          ref={workspaceGridRef}
          className="grid flex-1 lg:grid-cols-[320px_6px_1fr]"
          style={isDesktopLayout ? { gridTemplateColumns: `${sidebarWidth}px 6px 1fr` } : undefined}
        >
          <div className="h-full overflow-auto border-r border-[var(--border)] bg-[var(--surface)]/40 p-3">
          {sidebarTab === "workspace" ? (
            <CollectionsTree
              collections={collections}
              folders={folders}
              requests={requests}
              organizationName={organization?.name ?? "Workspace"}
              isReadonly={isReadonly}
              collectionFilter={collectionFilter}
              folderFilter={folderFilter}
              activeRequestId={activeRequestId}
              expandedCollectionIds={expandedCollectionIds}
              expandedFolderIds={expandedFolderIds}
              onToggleCollectionExpanded={toggleCollectionExpanded}
              onToggleFolderExpanded={toggleFolderExpanded}
              onSelectCollection={(id) => void handleSelectCollection(id)}
              onSelectFolder={(id) => void handleSelectFolder(id)}
              onSelectRequest={pickRequest}
              onResetFilters={() => void handleResetWorkspaceFilters()}
              onOpenContextMenu={openTreeMenu}
              onCreateCollection={() => openNameModal({ mode: "create-collection" })}
              canImportCollection={canAdmin(role)}
              onImportCollection={() => importInputRef.current?.click()}
            />
          ) : null}

          {sidebarTab === "environments" ? (
            <EnvironmentsPanel
              environments={environments}
              selectedEnvironmentId={selectedEnvironmentId}
              environmentVariablesDraft={environmentVariablesDraft}
              setEnvironmentVariablesDraft={setEnvironmentVariablesDraft}
              newEnvironmentName={newEnvironmentName}
              setNewEnvironmentName={setNewEnvironmentName}
              isReadonly={isReadonly}
              onSelectEnvironment={handleSelectEnvironment}
              onCreateEnvironment={(event) => void handleCreateEnvironment(event)}
              onSaveEnvironmentVariables={() => void handleSaveEnvironmentVariables()}
              onSetDefaultEnvironment={(id) => void handleSetDefaultEnvironment(id)}
              isCreatingEnvironment={isCreatingEnvironment}
              isSavingEnvironmentVariables={isSavingEnvironmentVariables}
              settingDefaultEnvironmentId={settingDefaultEnvironmentId}
            />
          ) : null}

          {sidebarTab === "history" ? (
            <HistoryPanel
              history={history}
              historyScope={historyScope}
              onSelectHistoryScope={(scope) => void handleSelectHistoryScope(scope)}
              onApplyHistoryEntry={applyHistoryEntry}
            />
          ) : null}

          {sidebarTab === "settings" ? (
            <WorkspaceControlsPanel
              role={role}
              isImporting={isImporting}
              importInputRef={importInputRef}
              onExport={() => void handleExportWorkspaceJson()}
              onOpenSettings={() => setSidebarTab("admin")}
            />
          ) : null}
          </div>

        <div
          className="hidden lg:flex cursor-col-resize items-stretch justify-center group"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize sidebar, double-click to reset"
          onMouseDown={(event) => {
            event.preventDefault();
            setIsResizingSidebar(true);
          }}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
        >
          <span className="w-1 rounded-full bg-[var(--border)] transition-colors group-hover:bg-[var(--primary)]" />
        </div>

        <main className="grid h-full overflow-hidden lg:grid-rows-[1.15fr_1fr]">
          {activeDetailTarget ? (
            <div className="overflow-hidden p-3">
            <CollectionOverviewPanel
              target={activeDetailTarget}
              collections={collections}
              folders={folders}
              requests={requests}
              environments={environments}
              selectedEnvironmentId={selectedEnvironmentId}
              isReadonly={isReadonly}
              detailTab={detailTab}
              setDetailTab={setDetailTab}
              onUpdateDescription={(value) =>
                activeDetailTarget.type === "collection"
                  ? handleUpdateCollectionDescription(activeDetailTarget.collection.id, value)
                  : handleUpdateFolderDescription(activeDetailTarget.folder.id, value)
              }
              onUpdateAuth={(auth) =>
                activeDetailTarget.type === "collection"
                  ? handleUpdateCollectionAuth(activeDetailTarget.collection.id, auth)
                  : handleUpdateFolderAuth(activeDetailTarget.folder.id, auth)
              }
              onNavigateToOwner={handleNavigateToAuthOwner}
            />
            </div>
          ) : (
            <>
              <RequestEditorPanel
                builder={builder}
                setBuilder={setBuilder}
                isReadonly={isReadonly}
                isSavingRequest={isSavingRequest}
                isDeletingRequest={isDeletingRequest}
                isExecuting={isExecuting}
                requestEditorTab={requestEditorTab}
                setRequestEditorTab={setRequestEditorTab}
                showCookiesEditor={showCookiesEditor}
                setShowCookiesEditor={setShowCookiesEditor}
                requestCookies={requestCookies}
                setRequestCookies={setRequestCookies}
                collections={collections}
                folders={folders}
                activeFolderPath={activeFolderPath}
                requestPathSegments={requestPathSegments}
                scriptDraft={scriptDraft}
                setScriptDraft={setScriptDraft}
                environmentVariableKeys={environmentVariableKeys}
                onNavigateToAuthOwner={handleNavigateToAuthOwner}
                onStartNewRequest={startNewRequest}
                onSaveRequest={() => void handleSaveRequest()}
                onDeleteRequest={() => void handleDeleteRequest()}
                onExecuteRequest={() => void handleExecuteRequest()}
              />

              <ResponsePanel
                executeResult={executeResult}
                responseTab={responseTab}
                setResponseTab={setResponseTab}
                responseText={responseText}
                responseCookieHeaders={responseCookieHeaders}
                isExecuting={isExecuting}
              />
            </>
          )}
        </main>
        </div>
        )}
      </div>

      <TreeContextMenu
        contextMenu={treeContextMenu}
        menuRef={treeContextMenuRef}
        onClose={() => setTreeContextMenu(null)}
        onCreateRequestIn={(collectionId, folderId) => void handleCreateRequestIn(collectionId, folderId)}
        onCreateFolderIn={handleCreateFolderIn}
        onRenameCollection={handleRenameCollectionItem}
        onDuplicateCollection={(collection) => void handleDuplicateCollectionItem(collection)}
        onExportCollection={(collection) => void handleExportCollection(collection)}
        onDeleteCollection={handleDeleteCollectionItem}
        onRenameFolder={handleRenameFolderItem}
        onDuplicateFolder={(folder) => void handleDuplicateFolderItem(folder)}
        onDeleteFolder={handleDeleteFolderItem}
        onRenameRequest={handleRenameRequestItem}
        onDuplicateRequest={(request) => void handleDuplicateRequestItem(request)}
        onDeleteRequest={handleDeleteRequestItem}
      />

      <NameModal
        nameModal={nameModal}
        value={nameModalValue}
        onValueChange={setNameModalValue}
        onSubmit={(event) => void submitNameModal(event)}
        onClose={closeNameModal}
        isSubmitting={isNameModalSubmitting}
      />

      <DeleteConfirmModal
        deleteConfirm={deleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => void confirmDelete()}
        isConfirming={isDeleteConfirming}
      />
    </div>
  );
}
