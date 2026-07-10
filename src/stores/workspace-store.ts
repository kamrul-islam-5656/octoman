"use client";

import { create } from "zustand";
import type {
  BuilderState,
  CollectionDto,
  DocumentationFolderDto,
  EnvironmentDto,
  ExecuteResultState,
  HistoryDto,
  HttpMethod,
  KeyValuePair,
  MockServerDto,
  MonitorDto,
  OrganizationDto,
  AdminUserDto,
  RequestDto,
  RequestType,
  SidebarTab,
  TabState,
  TestResult,
  ToastMessage,
  ToastType,
  WorkspaceInitialData,
} from "@/types";

/* ------------------------------------------------------------------ */
/*  Default builder                                                    */
/* ------------------------------------------------------------------ */

export function createDefaultBuilder(
  collectionId: string | null = null,
  folderId: string | null = null,
): BuilderState {
  return {
    id: null,
    name: "",
    description: "",
    request_type: "http",
    method: "GET",
    url: "",
    query_params: [],
    headers: [{ key: "Content-Type", value: "application/json", enabled: true }],
    bodyMode: "raw",
    bodyRawLanguage: "json",
    bodyRaw: "",
    bodyForm: [],
    auth: {
      type: "none",
      basic: { username: "", password: "" },
      bearerToken: "",
      apiKey: { key: "", value: "", addTo: "header" },
    },
    preRequestScript: "",
    testScript: "",
    graphqlQuery: "",
    graphqlVariables: "",
    collectionId,
    folderId,
    sort_order: 0,
    _dirty: false,
  };
}

let _tabCounter = 0;
function nextTabId(): string {
  return `tab_${++_tabCounter}_${Date.now()}`;
}

export function createTab(requestId: string | null = null, builder?: BuilderState): TabState {
  return {
    id: nextTabId(),
    requestId,
    builder: builder ?? createDefaultBuilder(),
    responseViewTab: "body",
    executeResult: null,
    testResults: [],
    consoleOutput: [],
    isExecuting: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export interface WorkspaceStore {
  /* ---- workspace data ---- */
  collections: CollectionDto[];
  requests: RequestDto[];
  environments: EnvironmentDto[];
  history: HistoryDto[];
  folders: DocumentationFolderDto[];
  users: AdminUserDto[];
  organization: OrganizationDto | null;
  mockServers: MockServerDto[];
  monitors: MonitorDto[];

  /* ---- tabs ---- */
  tabs: TabState[];
  activeTabId: string | null;

  /* ---- sidebar ---- */
  sidebarTab: SidebarTab;
  sidebarWidth: number;
  expandedCollectionIds: Record<string, boolean>;
  expandedFolderIds: Record<string, boolean>;
  treeSearch: string;

  /* ---- environment ---- */
  selectedEnvironmentId: string;

  /* ---- toasts ---- */
  toasts: ToastMessage[];

  /* ---- flags ---- */
  sidebarCollapsed: boolean;
  responseHeight: number;

  /* ---- actions: data ---- */
  setCollections: (c: CollectionDto[]) => void;
  setRequests: (r: RequestDto[]) => void;
  setEnvironments: (e: EnvironmentDto[]) => void;
  setHistory: (h: HistoryDto[]) => void;
  setFolders: (f: DocumentationFolderDto[]) => void;
  setUsers: (u: AdminUserDto[]) => void;
  setOrganization: (o: OrganizationDto | null) => void;
  setMockServers: (m: MockServerDto[]) => void;
  setMonitors: (m: MonitorDto[]) => void;
  loadInitialData: (data: WorkspaceInitialData) => void;

  /* ---- actions: tabs ---- */
  openTab: (requestId?: string | null, builder?: BuilderState) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabBuilder: (tabId: string, partial: Partial<BuilderState>) => void;
  updateTab: (tabId: string, partial: Partial<TabState>) => void;
  markTabDirty: (tabId: string) => void;
  markTabClean: (tabId: string) => void;

  /* ---- actions: sidebar ---- */
  setSidebarTab: (tab: SidebarTab) => void;
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  toggleCollection: (id: string) => void;
  toggleFolder: (id: string) => void;
  setTreeSearch: (q: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  /* ---- actions: environment ---- */
  setSelectedEnvironmentId: (id: string) => void;

  /* ---- actions: response ---- */
  setResponseHeight: (h: number) => void;

  /* ---- actions: toasts ---- */
  addToast: (type: ToastType, title: string, description?: string) => void;
  removeToast: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  /* ---- workspace data ---- */
  collections: [],
  requests: [],
  environments: [],
  history: [],
  folders: [],
  users: [],
  organization: null,
  mockServers: [],
  monitors: [],

  /* ---- tabs ---- */
  tabs: [createTab()],
  activeTabId: null,

  /* ---- sidebar ---- */
  sidebarTab: "collections",
  sidebarWidth: 280,
  expandedCollectionIds: {},
  expandedFolderIds: {},
  treeSearch: "",

  /* ---- environment ---- */
  selectedEnvironmentId: "",

  /* ---- toasts ---- */
  toasts: [],

  /* ---- flags ---- */
  sidebarCollapsed: false,
  responseHeight: 300,

  /* ---- actions: data ---- */
  setCollections: (c) => set({ collections: Array.isArray(c) ? c : [] }),
  setRequests: (r) => set({ requests: Array.isArray(r) ? r : [] }),
  setEnvironments: (e) => set({ environments: Array.isArray(e) ? e : [] }),
  setHistory: (h) => set({ history: Array.isArray(h) ? h : [] }),
  setFolders: (f) => set({ folders: Array.isArray(f) ? f : [] }),
  setUsers: (u) => set({ users: Array.isArray(u) ? u : [] }),
  setOrganization: (o) => set({ organization: o }),
  setMockServers: (m) => set({ mockServers: Array.isArray(m) ? m : [] }),
  setMonitors: (m) => set({ monitors: Array.isArray(m) ? m : [] }),
  loadInitialData: (data) => {
    const collections = Array.isArray(data.collections) ? data.collections : [];
    const requests = Array.isArray(data.requests) ? data.requests : [];
    const environments = Array.isArray(data.environments) ? data.environments : [];
    const historyArr = Array.isArray(data.history) ? data.history : [];
    const folders = Array.isArray(data.folders) ? data.folders : [];
    const users = Array.isArray(data.users) ? data.users : [];
    const defaultEnv = environments.find((e) => e.is_default);
    set({
      collections,
      requests,
      environments,
      history: historyArr,
      folders,
      users,
      organization: data.organization ?? null,
      selectedEnvironmentId: defaultEnv?.id ?? "",
    });
    // Initialize first tab if we have only the initial empty tab
    const { tabs, activeTabId } = get();
    if (tabs.length === 1 && !activeTabId) {
      set({ activeTabId: tabs[0].id });
    }
  },

  /* ---- actions: tabs ---- */
  openTab: (requestId, builder) => {
    const { tabs } = get();
    // If a request is already open in a tab, activate it
    if (requestId) {
      const existing = tabs.find((t) => t.requestId === requestId);
      if (existing) {
        set({ activeTabId: existing.id });
        return existing.id;
      }
    }
    const tab = createTab(requestId, builder);
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },
  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) {
      // Always keep at least one tab
      const fresh = createTab();
      set({ tabs: [fresh], activeTabId: fresh.id });
      return;
    }
    const idx = tabs.findIndex((t) => t.id === tabId);
    const remaining = tabs.filter((t) => t.id !== tabId);
    let nextActive = activeTabId;
    if (activeTabId === tabId) {
      nextActive = remaining[Math.min(idx, remaining.length - 1)]?.id ?? remaining[0]?.id ?? null;
    }
    set({ tabs: remaining, activeTabId: nextActive });
  },
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  updateTabBuilder: (tabId, partial) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, builder: { ...t.builder, ...partial, _dirty: true } }
          : t,
      ),
    })),
  updateTab: (tabId, partial) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...partial } : t)),
    })),
  markTabDirty: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, builder: { ...t.builder, _dirty: true } } : t,
      ),
    })),
  markTabClean: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, builder: { ...t.builder, _dirty: false } } : t,
      ),
    })),

  /* ---- actions: sidebar ---- */
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleCollection: (id) =>
    set((s) => ({
      expandedCollectionIds: {
        ...s.expandedCollectionIds,
        [id]: !s.expandedCollectionIds[id],
      },
    })),
  toggleFolder: (id) =>
    set((s) => ({
      expandedFolderIds: {
        ...s.expandedFolderIds,
        [id]: !s.expandedFolderIds[id],
      },
    })),
  setTreeSearch: (q) => set({ treeSearch: q }),
  expandAll: () => {
    const { collections, folders } = get();
    const cMap: Record<string, boolean> = {};
    const fMap: Record<string, boolean> = {};
    collections.forEach((c) => { cMap[c.id] = true; });
    folders.forEach((f) => { fMap[f.id] = true; });
    set({ expandedCollectionIds: cMap, expandedFolderIds: fMap });
  },
  collapseAll: () => set({ expandedCollectionIds: {}, expandedFolderIds: {} }),

  /* ---- actions: environment ---- */
  setSelectedEnvironmentId: (id) => set({ selectedEnvironmentId: id }),

  /* ---- actions: response ---- */
  setResponseHeight: (h) => set({ responseHeight: h }),

  /* ---- actions: toasts ---- */
  addToast: (type, title, description) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const toast: ToastMessage = { id, type, title, description, duration: 4000 };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, toast.duration);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
