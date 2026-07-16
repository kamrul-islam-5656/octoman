"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { TopBar } from "@/components/layout/TopBar";
import { useApiFetch } from "@/components/providers/ApiActivityProvider";
import { executeRequestInBrowser, isLocalOrPrivateHost } from "@/lib/client/request-runner";
import { interpolateString, variablesToMap } from "@/lib/server/interpolate";
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

import { AiSettingsPanel } from "./workspace/AiSettingsPanel";
import { CollectionOverviewPanel, DetailTabId, DetailViewTarget } from "./workspace/CollectionOverviewPanel";
import { CollectionsTree } from "./workspace/CollectionsTree";
import { DeleteConfirmModal } from "./workspace/DeleteConfirmModal";
import { UnsavedTabCloseModal } from "./workspace/UnsavedTabCloseModal";
import { HistoryPanel } from "./workspace/HistoryPanel";
import { NameModal } from "./workspace/NameModal";
import { OrganizationPanel } from "./workspace/OrganizationPanel";
import { RequestEditorPanel } from "./workspace/RequestEditorPanel";
import { RequestTabBar, RequestTabBarItem } from "./workspace/RequestTabBar";
import { ResponsePanel } from "./workspace/ResponsePanel";
import { SidebarIconRail, SidebarTab } from "./workspace/SidebarIconRail";
import { TreeContextMenu } from "./workspace/TreeContextMenu";
import {
  BuilderState,
  DeleteConfirmState,
  NameModalState,
  RequestEditorTabId,
  RequestTabState,
  ResponseTabId,
  TreeContextMenuPayload,
  TreeContextMenuState,
} from "./workspace/types";
import {
  AuthOwnerRef,
  canAdmin,
  canWrite,
  clamp,
  cloneBuilderState,
  createEmptyBuilder,
  createInheritAuth,
  extractCookiesFromHeaders,
  getActiveEnvironmentForCollection,
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

const DEFAULT_SCRIPT_DRAFT =
  "// Scripts run support can be connected here.\n// Keep this script for request-related notes.";

function createRequestTab(
  builder: BuilderState,
  requestId: string | null = null,
  requestCookies: KeyValuePair[] = [],
): RequestTabState {
  return {
    tabId: `tab-${crypto.randomUUID()}`,
    requestId,
    builder,
    savedSnapshot: cloneBuilderState(builder),
    requestEditorTab: "docs",
    requestCookies,
    showCookiesEditor: false,
    responseTab: "body",
    executeResult: null,
    isExecuting: false,
    isSavingRequest: false,
    isDeletingRequest: false,
    scriptDraft: DEFAULT_SCRIPT_DRAFT,
  };
}

function isRequestTabDirty(tab: RequestTabState): boolean {
  return JSON.stringify(tab.builder) !== JSON.stringify(tab.savedSnapshot);
}

const OPEN_TABS_STORAGE_PREFIX = "octoman-open-tabs-";

interface PersistedTab {
  tabId: string;
  requestId: string | null;
  builder: BuilderState;
  savedSnapshot: BuilderState;
  requestEditorTab: RequestEditorTabId;
  requestCookies: KeyValuePair[];
  showCookiesEditor: boolean;
  responseTab: ResponseTabId;
  scriptDraft: string;
}

interface PersistedTabsPayload {
  tabs: PersistedTab[];
  activeTabId: string | null;
}

function toPersistedTab(tab: RequestTabState): PersistedTab {
  return {
    tabId: tab.tabId,
    requestId: tab.requestId,
    builder: tab.builder,
    savedSnapshot: tab.savedSnapshot,
    requestEditorTab: tab.requestEditorTab,
    requestCookies: tab.requestCookies,
    showCookiesEditor: tab.showCookiesEditor,
    responseTab: tab.responseTab,
    scriptDraft: tab.scriptDraft,
  };
}

function fromPersistedTab(persisted: PersistedTab): RequestTabState {
  return {
    ...persisted,
    executeResult: null,
    isExecuting: false,
    isSavingRequest: false,
    isDeletingRequest: false,
  };
}

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
  const apiFetch = useApiFetch();

  const role = session?.user?.role;

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

  const [tabs, setTabs] = useState<RequestTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isTabsHydrated, setIsTabsHydrated] = useState(false);

  const openTabsStorageKey = `${OPEN_TABS_STORAGE_PREFIX}${initialData.activeWorkspaceId}`;

  useEffect(() => {
    const stored = window.localStorage.getItem(openTabsStorageKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PersistedTabsPayload;
        const validRequestIds = new Set(initialData.requests.map((item) => item.id));
        const restoredTabs = parsed.tabs
          .filter((tab) => tab.requestId === null || validRequestIds.has(tab.requestId))
          .map(fromPersistedTab);

        setTabs(restoredTabs);
        setActiveTabId(
          restoredTabs.some((tab) => tab.tabId === parsed.activeTabId)
            ? parsed.activeTabId
            : (restoredTabs[0]?.tabId ?? null),
        );
      } catch {
        // Ignore corrupt/incompatible persisted tab state.
      }
    }

    setIsTabsHydrated(true);
    // Restore once on mount only; the persist effect below keeps storage in sync afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTabsHydrated) return;

    window.localStorage.setItem(
      openTabsStorageKey,
      JSON.stringify({ tabs: tabs.map(toPersistedTab), activeTabId } satisfies PersistedTabsPayload),
    );
  }, [tabs, activeTabId, isTabsHydrated, openTabsStorageKey]);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.tabId === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const builder = activeTab?.builder ?? createEmptyBuilder();
  const activeRequestId = activeTab?.requestId ?? null;
  const executeResult = activeTab?.executeResult ?? null;
  const requestEditorTab = activeTab?.requestEditorTab ?? "docs";
  const responseTab = activeTab?.responseTab ?? "body";
  const requestCookies = activeTab?.requestCookies ?? [];
  const showCookiesEditor = activeTab?.showCookiesEditor ?? false;
  const scriptDraft = activeTab?.scriptDraft ?? DEFAULT_SCRIPT_DRAFT;
  const isExecuting = activeTab?.isExecuting ?? false;
  const isSavingRequest = activeTab?.isSavingRequest ?? false;
  const isDeletingRequest = activeTab?.isDeletingRequest ?? false;

  const tabBarItems = useMemo<RequestTabBarItem[]>(
    () =>
      tabs.map((tab) => ({
        tabId: tab.tabId,
        requestId: tab.requestId,
        name: tab.builder.name,
        method: tab.builder.method,
        isDirty: isRequestTabDirty(tab),
      })),
    [tabs],
  );

  function updateTabById(tabId: string, updater: (tab: RequestTabState) => Partial<RequestTabState>) {
    setTabs((previous) => previous.map((tab) => (tab.tabId === tabId ? { ...tab, ...updater(tab) } : tab)));
  }

  function updateActiveTab(updater: (tab: RequestTabState) => Partial<RequestTabState>) {
    if (!activeTabId) return;
    updateTabById(activeTabId, updater);
  }

  const setBuilder = (update: BuilderState | ((previous: BuilderState) => BuilderState)) => {
    updateActiveTab((tab) => ({
      builder: typeof update === "function" ? (update as (previous: BuilderState) => BuilderState)(tab.builder) : update,
    }));
  };

  const setRequestEditorTab = (tab: RequestEditorTabId) => updateActiveTab(() => ({ requestEditorTab: tab }));
  const setResponseTab = (tab: ResponseTabId) => updateActiveTab(() => ({ responseTab: tab }));
  const setScriptDraft = (value: string) => updateActiveTab(() => ({ scriptDraft: value }));

  const setRequestCookies = (update: KeyValuePair[] | ((previous: KeyValuePair[]) => KeyValuePair[])) => {
    updateActiveTab((tab) => ({
      requestCookies:
        typeof update === "function"
          ? (update as (previous: KeyValuePair[]) => KeyValuePair[])(tab.requestCookies)
          : update,
    }));
  };

  const setShowCookiesEditor = (update: boolean | ((previous: boolean) => boolean)) => {
    updateActiveTab((tab) => ({
      showCookiesEditor: typeof update === "function" ? (update as (previous: boolean) => boolean)(tab.showCookiesEditor) : update,
    }));
  };

  function closeTab(tabId: string) {
    const index = tabs.findIndex((tab) => tab.tabId === tabId);
    if (index === -1) return;

    const nextTabs = tabs.filter((tab) => tab.tabId !== tabId);
    setTabs(nextTabs);

    if (activeTabId === tabId) {
      const neighbor = nextTabs[index] ?? nextTabs[index - 1] ?? null;
      setActiveTabId(neighbor?.tabId ?? null);
    }
  }

  function selectTab(tabId: string) {
    setActiveTabId(tabId);
    setActiveDetailView(null);
  }

  const [unsavedTabCloseId, setUnsavedTabCloseId] = useState<string | null>(null);

  function requestCloseTab(tabId: string) {
    const tab = tabs.find((item) => item.tabId === tabId);
    if (tab && isRequestTabDirty(tab)) {
      setUnsavedTabCloseId(tabId);
      return;
    }
    closeTab(tabId);
  }

  function cancelCloseTabConfirm() {
    setUnsavedTabCloseId(null);
  }

  function discardAndCloseTab() {
    if (!unsavedTabCloseId) return;
    closeTab(unsavedTabCloseId);
    setUnsavedTabCloseId(null);
  }

  async function saveAndCloseTab() {
    if (!unsavedTabCloseId) return;
    const tabId = unsavedTabCloseId;
    const success = await handleSaveRequest(tabId);
    if (success) {
      closeTab(tabId);
      setUnsavedTabCloseId(null);
    }
  }

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingEnvironment, setIsCreatingEnvironment] = useState(false);
  const [isSavingEnvironmentVariables, setIsSavingEnvironmentVariables] = useState(false);
  const [settingActiveEnvironmentId, setSettingActiveEnvironmentId] = useState<string | null>(null);
  const [deletingEnvironmentId, setDeletingEnvironmentId] = useState<string | null>(null);
  const [isNameModalSubmitting, setIsNameModalSubmitting] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("workspace");
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
    () => getEnvironmentVariableKeys(getActiveEnvironmentForCollection(environments, builder.collectionId)),
    [environments, builder.collectionId],
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
    const response = await apiFetch("/api/collections", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: CollectionDto[]; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load collections."));
      return;
    }

    setCollections(payload?.data ?? []);
    setGlobalError(null);
  }, [apiFetch]);

  const loadFolders = useCallback(async () => {
    const response = await apiFetch("/api/documentation/folders", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: DocumentationFolderDto[]; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load folders."));
      return;
    }

    setFolders(payload?.data ?? []);
    setGlobalError(null);
  }, [apiFetch]);

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

      const response = await apiFetch(`/api/requests${suffix}`, { cache: "no-store" });
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
    [collectionFilter, folderFilter, apiFetch],
  );

  const loadEnvironments = useCallback(async () => {
    const response = await apiFetch("/api/environments", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: EnvironmentDto[]; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load environments."));
      return;
    }

    setEnvironments(payload?.data ?? []);
    setGlobalError(null);
  }, [apiFetch]);

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

      const response = await apiFetch(`/api/history?${query.toString()}`, {
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
    [collectionFilter, historyScope, folderFilter, apiFetch],
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

  function collapseAllFoldersInCollection(collectionId: string) {
    setExpandedFolderIds((previous) => {
      const next = { ...previous };

      folders.forEach((folder) => {
        if (folder.collection_id === collectionId) {
          next[folder.id] = false;
        }
      });

      return next;
    });
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

    if (activeTab && activeTab.requestId === null) {
      updateActiveTab((tab) => ({
        builder: { ...tab.builder, collectionId: nextCollectionId === "all" ? null : nextCollectionId },
      }));
    }

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

    if (activeTab && activeTab.requestId === null) {
      updateActiveTab((tab) => ({
        builder: { ...tab.builder, folderId: nextFolderId === "all" ? null : nextFolderId },
      }));
    }

    await loadHistory(collectionFilter, historyScope, nextFolderId);
  }

  async function handleSelectHistoryScope(scope: "mine" | "tenant") {
    setHistoryScope(scope);
    await loadHistory(collectionFilter, scope, folderFilter);
  }

  async function createCollectionWithName(name: string) {
    const response = await apiFetch("/api/collections", {
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

  async function handleCreateEnvironment(collectionId: string, name: string) {
    setIsCreatingEnvironment(true);
    try {
      const existingForCollection = environments.filter((item) => item.collection_id === collectionId);

      const response = await apiFetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId,
          name,
          is_default: existingForCollection.length === 0,
          variables: [{ key: "base_url", value: "https://api.example.com" }],
        }),
      });

      const payload = (await response.json().catch(() => null)) as { data?: EnvironmentDto; error?: string } | null;

      if (!response.ok || !payload?.data) {
        setGlobalError(getErrorMessage(payload, "Failed to create environment."));
        return;
      }

      setEnvironments((previous) => [...previous, payload.data as EnvironmentDto]);
      setGlobalError(null);
    } finally {
      setIsCreatingEnvironment(false);
    }
  }

  async function handleSaveEnvironmentVariables(environmentId: string, variables: EnvironmentVariable[]) {
    setIsSavingEnvironmentVariables(true);
    try {
      const cleaned = variables.filter((item) => item.key.trim());

      const response = await apiFetch(`/api/environments/${environmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: cleaned }),
      });

      const payload = (await response.json().catch(() => null)) as { data?: EnvironmentDto; error?: string } | null;

      if (!response.ok || !payload?.data) {
        setGlobalError(getErrorMessage(payload, "Failed to save environment variables."));
        return;
      }

      const updated = payload.data;
      setEnvironments((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setGlobalError(null);
    } finally {
      setIsSavingEnvironmentVariables(false);
    }
  }

  async function handleSetActiveEnvironment(environmentId: string) {
    setSettingActiveEnvironmentId(environmentId);
    try {
      const response = await apiFetch(`/api/environments/${environmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });

      const payload = (await response.json().catch(() => null)) as { data?: EnvironmentDto; error?: string } | null;

      if (!response.ok || !payload?.data) {
        setGlobalError(getErrorMessage(payload, "Failed to set active environment."));
        return;
      }

      const updated = payload.data;
      setEnvironments((previous) =>
        previous.map((item) =>
          item.collection_id === updated.collection_id ? { ...item, is_default: item.id === updated.id } : item,
        ),
      );
      setGlobalError(null);
    } finally {
      setSettingActiveEnvironmentId(null);
    }
  }

  async function handleDeleteEnvironment(environmentId: string) {
    setDeletingEnvironmentId(environmentId);
    try {
      const response = await apiFetch(`/api/environments/${environmentId}`, { method: "DELETE" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setGlobalError(getErrorMessage(payload, "Failed to delete environment."));
        return;
      }

      setEnvironments((previous) => previous.filter((item) => item.id !== environmentId));
      setGlobalError(null);
    } finally {
      setDeletingEnvironmentId(null);
    }
  }

  function startNewRequest() {
    const newBuilder = createEmptyBuilder(
      collectionFilter !== "all" ? collectionFilter : null,
      folderFilter !== "all" ? folderFilter : null,
    );
    const tab = createRequestTab(newBuilder);
    setTabs((previous) => [...previous, tab]);
    setActiveTabId(tab.tabId);
    setActiveDetailView(null);
  }

  function openOrActivateRequestTab(item: RequestDto) {
    setActiveDetailView(null);

    if (item.collection_id) {
      setExpandedCollectionIds((previous) => ({
        ...previous,
        [item.collection_id as string]: true,
      }));
    }

    expandFolderWithAncestors(item.folder_id);

    const existingTab = tabs.find((tab) => tab.requestId === item.id);
    if (existingTab) {
      setActiveTabId(existingTab.tabId);
      return;
    }

    const sanitizedHeaders = stripCookieHeaders(item.headers);
    const nextBuilder: BuilderState = {
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
    };

    const tab = createRequestTab(nextBuilder, item.id, extractCookiesFromHeaders(item.headers));
    setTabs((previous) => [...previous, tab]);
    setActiveTabId(tab.tabId);
  }

  async function handleSaveRequest(tabId: string | null = activeTabId): Promise<boolean> {
    if (!tabId) return false;

    const targetTab = tabs.find((tab) => tab.tabId === tabId);
    if (!targetTab) return false;

    const targetBuilder = targetTab.builder;

    if (!targetBuilder.name.trim()) {
      setGlobalError("Request name is required before saving.");
      return false;
    }

    if (!targetBuilder.url.trim()) {
      setGlobalError("URL is required before saving.");
      return false;
    }

    if (targetBuilder.bodyMode === "raw" && targetBuilder.bodyRaw.trim()) {
      const jsonError = getJsonParseError(targetBuilder.bodyRaw);
      if (jsonError) {
        setGlobalError(`Invalid JSON body: ${jsonError}`);
        return false;
      }
    }

    updateTabById(tabId, () => ({ isSavingRequest: true }));
    setGlobalError(null);

    const headersWithCookies = mergeCookiesIntoHeaders(targetBuilder.headers, targetTab.requestCookies);

    const payload = {
      name: targetBuilder.name,
      description: targetBuilder.description,
      method: targetBuilder.method,
      url: targetBuilder.url,
      headers: headersWithCookies,
      bodyMode: targetBuilder.bodyMode,
      bodyRaw: targetBuilder.bodyRaw,
      bodyForm: targetBuilder.bodyForm,
      auth: targetBuilder.auth,
      body: targetBuilder.bodyRaw,
      collectionId: targetBuilder.collectionId,
      folderId: targetBuilder.folderId,
    };

    const endpoint = targetBuilder.id ? `/api/requests/${targetBuilder.id}` : "/api/requests";
    const method = targetBuilder.id ? "PATCH" : "POST";

    const response = await apiFetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    updateTabById(tabId, () => ({ isSavingRequest: false }));

    if (!response.ok) {
      const responsePayload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setGlobalError(getErrorMessage(responsePayload, "Failed to save request."));
      return false;
    }

    const responsePayload = (await response.json()) as { data?: RequestDto };
    if (responsePayload.data) {
      const newId = responsePayload.data.id;
      updateTabById(tabId, (tab) => {
        const updatedBuilder = { ...tab.builder, id: newId };
        return {
          builder: updatedBuilder,
          requestId: newId,
          savedSnapshot: cloneBuilderState(updatedBuilder),
        };
      });
    }

    await loadRequests("all", "all");
    return true;
  }

  async function handleDeleteRequest() {
    const tabId = activeTabId;
    if (!tabId || !builder.id) {
      return;
    }

    updateTabById(tabId, () => ({ isDeletingRequest: true }));
    try {
      const response = await apiFetch(`/api/requests/${builder.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setGlobalError(getErrorMessage(payload, "Failed to delete request."));
        return;
      }

      closeTab(tabId);
      await loadRequests("all", "all");
    } finally {
      updateTabById(tabId, () => ({ isDeletingRequest: false }));
    }
  }

  async function handleExecuteRequest() {
    const tabId = activeTabId;
    if (!tabId) return;

    if (!builder.url.trim()) {
      setGlobalError("URL is required before executing request.");
      return;
    }

    if (builder.bodyMode === "raw" && builder.bodyRaw.trim()) {
      const jsonError = getJsonParseError(builder.bodyRaw);
      if (jsonError) {
        updateTabById(tabId, () => ({
          executeResult: {
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
          },
        }));
        setGlobalError(`Invalid JSON body: ${jsonError}`);
        return;
      }
    }

    updateTabById(tabId, () => ({ isExecuting: true, executeResult: null }));
    setGlobalError(null);

    const headersWithCookies = mergeCookiesIntoHeaders(builder.headers, requestCookies);
    const effectiveAuth =
      builder.auth.type === "inherit"
        ? resolveEffectiveAuth(builder.folderId, builder.collectionId, folders, collections).auth
        : builder.auth;
    const activeEnvironment = getActiveEnvironmentForCollection(environments, builder.collectionId);
    const variableMap = variablesToMap(activeEnvironment?.variables);

    let targetsLocalHost = false;
    try {
      targetsLocalHost = isLocalOrPrivateHost(new URL(interpolateString(builder.url, variableMap)).hostname);
    } catch {
      targetsLocalHost = false;
    }

    let payload:
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
    let responseOk: boolean;

    if (targetsLocalHost) {
      const localResult = await executeRequestInBrowser({
        method: builder.method,
        url: builder.url,
        headers: headersWithCookies,
        bodyMode: builder.bodyMode,
        bodyRaw: builder.bodyRaw,
        bodyForm: builder.bodyForm,
        auth: effectiveAuth,
        variableMap,
      });

      const response = await apiFetch("/api/tester/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: builder.id,
          collectionId: builder.collectionId,
          folderId: builder.folderId,
          environmentId: activeEnvironment?.id ?? null,
          method: builder.method,
          url: localResult.finalUrl,
          headers: localResult.interpolatedHeaders,
          bodyMode: localResult.bodyMode,
          bodyRaw: localResult.persistedBodyRaw,
          bodyForm: localResult.persistedBodyForm,
          auth: effectiveAuth,
          envVariables: variableMap,
          outcome: {
            status: localResult.status,
            headers: localResult.headers,
            body: localResult.body,
            durationMs: localResult.durationMs,
            errorCode: localResult.errorCode,
            error: localResult.error,
          },
        }),
      });

      payload = await response.json().catch(() => null);
      responseOk = response.ok;
    } else {
      const response = await apiFetch("/api/tester/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: builder.id,
          collectionId: builder.collectionId,
          folderId: builder.folderId,
          environmentId: activeEnvironment?.id ?? null,
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

      payload = await response.json().catch(() => null);
      responseOk = response.ok;
    }

    updateTabById(tabId, () => ({
      isExecuting: false,
      executeResult: {
        ok: Boolean(payload?.ok),
        status: payload?.status ?? 0,
        headers: payload?.headers ?? [],
        body: payload?.body ?? null,
        durationMs: payload?.durationMs ?? 0,
        errorCode: payload?.errorCode ?? null,
        error: payload?.error ?? (responseOk ? null : "Execution failed."),
      },
    }));

    if (!responseOk && payload?.error) {
      setGlobalError(payload.error);
    }

    await Promise.all([
      loadHistory(collectionFilter, historyScope, folderFilter),
      loadRequests("all", "all"),
    ]);
  }

  function applyHistoryEntry(entry: HistoryDto) {
    const sanitizedHeaders = stripCookieHeaders(entry.headers);

    const nextBuilder: BuilderState = {
      id: null,
      name: `${entry.method} ${entry.url}`,
      description: "",
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
    };

    const tab = createRequestTab(nextBuilder, null, extractCookiesFromHeaders(entry.headers));
    setTabs((previous) => [...previous, tab]);
    setActiveTabId(tab.tabId);
    setActiveDetailView(null);
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
    const response = await apiFetch("/api/documentation/folders", {
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

    const response = await apiFetch("/api/requests", {
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
      openOrActivateRequestTab(payload.data);
    }
  }

  async function renameCollectionWithName(collection: CollectionDto, name: string) {
    const response = await apiFetch(`/api/collections/${collection.id}`, {
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
    const response = await apiFetch(`/api/documentation/folders/${folder.id}`, {
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
    const response = await apiFetch(`/api/collections/${collectionId}`, {
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
    const response = await apiFetch(`/api/collections/${collectionId}`, {
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
    const response = await apiFetch(`/api/documentation/folders/${folderId}`, {
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
    const response = await apiFetch(`/api/documentation/folders/${folderId}`, {
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
        apiFetch(`/api/requests/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auth: inheritAuth }),
        }),
      ),
    );

    await loadRequests("all", "all");

    setTabs((previous) =>
      previous.map((tab) =>
        tab.builder.folderId === folderId
          ? {
              ...tab,
              builder: { ...tab.builder, auth: inheritAuth },
              savedSnapshot: { ...tab.savedSnapshot, auth: inheritAuth },
            }
          : tab,
      ),
    );
  }

  function handleNavigateToAuthOwner(owner: AuthOwnerRef) {
    openDetailView({ type: owner.type, id: owner.id }, "authorization");
  }

  async function renameRequestWithName(request: RequestDto, name: string) {
    const response = await apiFetch(`/api/requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to rename request."));
      return;
    }

    setTabs((previous) =>
      previous.map((tab) =>
        tab.requestId === request.id
          ? {
              ...tab,
              builder: { ...tab.builder, name },
              savedSnapshot: { ...tab.savedSnapshot, name },
            }
          : tab,
      ),
    );

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
    const response = await apiFetch(`/api/collections/${collection.id}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to delete collection."));
      return;
    }

    const remainingTabs = tabs.filter((tab) => tab.builder.collectionId !== collection.id);
    if (remainingTabs.length !== tabs.length) {
      setTabs(remainingTabs);
      if (activeTabId && !remainingTabs.some((tab) => tab.tabId === activeTabId)) {
        setActiveTabId(remainingTabs[0]?.tabId ?? null);
      }
    }

    if (collectionFilter === collection.id) {
      setCollectionFilter("all");
      setFolderFilter("all");
    }

    setGlobalError(null);
    await refreshTree();
  }

  async function performDeleteFolder(folder: DocumentationFolderDto) {
    const response = await apiFetch(`/api/documentation/folders/${folder.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to delete folder."));
      return;
    }

    setTabs((previous) =>
      previous.map((tab) =>
        tab.builder.folderId === folder.id
          ? {
              ...tab,
              builder: { ...tab.builder, folderId: null },
              savedSnapshot: { ...tab.savedSnapshot, folderId: null },
            }
          : tab,
      ),
    );

    if (folderFilter === folder.id) {
      setFolderFilter("all");
    }

    setGlobalError(null);
    await Promise.all([loadFolders(), loadRequests("all", "all")]);
  }

  async function performDeleteRequest(request: RequestDto) {
    const response = await apiFetch(`/api/requests/${request.id}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setGlobalError(getErrorMessage(payload, "Failed to delete request."));
      return;
    }

    const openTab = tabs.find((tab) => tab.requestId === request.id);
    if (openTab) {
      closeTab(openTab.tabId);
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

    const response = await apiFetch("/api/requests", {
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
      await apiFetch("/api/requests", {
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
    const response = await apiFetch("/api/documentation/folders", {
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

    const response = await apiFetch("/api/collections", {
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
    const response = await apiFetch("/api/workspace/export", { cache: "no-store" });
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
    const response = await apiFetch(
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

      const response = await apiFetch("/api/workspace/import", {
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
        ) : sidebarTab === "ai" ? (
          <div className="h-full flex-1 overflow-auto">
            <AiSettingsPanel />
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
              isReadonly={isReadonly}
              collectionFilter={collectionFilter}
              folderFilter={folderFilter}
              activeRequestId={activeRequestId}
              expandedCollectionIds={expandedCollectionIds}
              expandedFolderIds={expandedFolderIds}
              onToggleCollectionExpanded={toggleCollectionExpanded}
              onToggleFolderExpanded={toggleFolderExpanded}
              onCollapseCollectionFolders={collapseAllFoldersInCollection}
              onSelectCollection={(id) => void handleSelectCollection(id)}
              onSelectFolder={(id) => void handleSelectFolder(id)}
              onSelectRequest={openOrActivateRequestTab}
              onOpenContextMenu={openTreeMenu}
              onCreateCollection={() => openNameModal({ mode: "create-collection" })}
              canImportCollection={canAdmin(role)}
              onImportCollection={() => importInputRef.current?.click()}
            />
          ) : null}

          {sidebarTab === "history" ? (
            <HistoryPanel
              history={history}
              users={users}
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

        <main className="grid h-full overflow-hidden lg:grid-rows-[auto_1.15fr_1fr]">
          <RequestTabBar
            tabs={tabBarItems}
            activeTabId={activeTabId}
            onSelectTab={selectTab}
            onCloseTab={requestCloseTab}
            onNewTab={startNewRequest}
          />

          {activeDetailTarget ? (
            <div className="overflow-hidden lg:row-span-2">
            <CollectionOverviewPanel
              target={activeDetailTarget}
              collections={collections}
              folders={folders}
              requests={requests}
              environments={environments}
              isReadonly={isReadonly}
              detailTab={detailTab}
              setDetailTab={setDetailTab}
              onOpenAiSettings={() => setSidebarTab("ai")}
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
              isCreatingEnvironment={isCreatingEnvironment}
              settingActiveEnvironmentId={settingActiveEnvironmentId}
              isSavingEnvironmentVariables={isSavingEnvironmentVariables}
              deletingEnvironmentId={deletingEnvironmentId}
              onCreateEnvironment={(collectionId, name) => void handleCreateEnvironment(collectionId, name)}
              onSetActiveEnvironment={(id) => void handleSetActiveEnvironment(id)}
              onSaveEnvironmentVariables={(id, variables) => void handleSaveEnvironmentVariables(id, variables)}
              onDeleteEnvironment={(id) => void handleDeleteEnvironment(id)}
            />
            </div>
          ) : activeTab ? (
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
                environments={environments}
                onSelectEnvironment={(id) => void handleSetActiveEnvironment(id)}
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
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
              Select a request from the sidebar or start a new one.
            </div>
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

      {unsavedTabCloseId ? (
        <UnsavedTabCloseModal
          requestName={tabs.find((tab) => tab.tabId === unsavedTabCloseId)?.builder.name ?? ""}
          isSaving={tabs.find((tab) => tab.tabId === unsavedTabCloseId)?.isSavingRequest ?? false}
          onCancel={cancelCloseTabConfirm}
          onDiscard={discardAndCloseTab}
          onSave={() => void saveAndCloseTab()}
        />
      ) : null}
    </div>
  );
}
