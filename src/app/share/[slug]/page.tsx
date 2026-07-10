"use client";

import { use, useEffect, useState, type ReactElement } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface SharedCollectionInfo {
  id: string;
  name: string;
  description?: string;
  slug: string;
}

interface SharedFolder {
  id: string;
  collectionId: string | null;
  parentId: string | null;
  name: string;
  description?: string;
}

interface SharedRequest {
  id: string;
  collectionId: string | null;
  folderId: string | null;
  name: string;
  description?: string;
  method: string;
  url: string;
}

interface SharedPayload {
  schemaVersion: number;
  exportedAt: string;
  shared: boolean;
  collection: SharedCollectionInfo;
  folders: SharedFolder[];
  requests: SharedRequest[];
}

type SelectedItem = 
  | { type: "collection" }
  | { type: "folder"; folderId: string }
  | { type: "request"; requestId: string };

function getMethodColor(method: string): string {
  const m = method.toUpperCase();
  switch (m) {
    case "GET": return "#61affe";
    case "POST": return "#49cc90";
    case "PUT": return "#fca130";
    case "PATCH": return "#50e3c2";
    case "DELETE": return "#f93e3e";
    case "HEAD": return "#9012fe";
    case "OPTIONS": return "#0ed7b5";
    default: return "#999";
  }
}

interface SidebarItemProps {
  item: SharedFolder | SharedRequest | { type: "collection"; name: string };
  isSelected: boolean;
  isFolder: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onToggle: () => void;
  depth: number;
  payload: SharedPayload;
}

function SidebarItem({
  item,
  isSelected,
  isFolder,
  isExpanded,
  hasChildren,
  onSelect,
  onToggle,
  depth,
  payload,
}: {
  item: SharedFolder | SharedRequest | { type: "collection"; name: string };
  isSelected: boolean;
  isFolder: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onToggle: () => void;
  depth: number;
  payload: SharedPayload;
}): ReactElement {
  const name = "name" in item ? item.name : "Unknown";
  const isRequest = "method" in item;
  const method = isRequest ? (item as SharedRequest).method : null;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          borderRadius: 4,
          cursor: "pointer",
          background: isSelected ? "rgba(73, 204, 144, 0.1)" : "transparent",
          borderLeft: isSelected ? `3px solid #49cc90` : "3px solid transparent",
          fontSize: 12,
          color: isSelected ? "var(--text)" : "var(--text-secondary)",
          fontWeight: isSelected ? 600 : 400,
          userSelect: "none",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isSelected
            ? "rgba(73, 204, 144, 0.15)"
            : "rgba(255, 255, 255, 0.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isSelected
            ? "rgba(73, 204, 144, 0.1)"
            : "transparent";
        }}
      >
        {isFolder && hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: "inherit",
              fontSize: 10,
              width: 16,
            }}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        ) : (
          <span style={{ width: 16 }}>
            {isRequest ? (
              <span
                style={{
                  display: "inline-block",
                  fontSize: 7,
                  fontWeight: 700,
                  color: method ? getMethodColor(method) : "#999",
                  width: "100%",
                  textAlign: "center",
                }}
              >
                {method?.slice(0, 3).toUpperCase()}
              </span>
            ) : (
              <span style={{ fontSize: 12 }}>📁</span>
            )}
          </span>
        )}
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </span>
      </div>
    </div>
  );
}

interface FolderTreeProps {
  folders: SharedFolder[];
  requests: SharedRequest[];
  parentId: string | null;
  depth: number;
  selectedItem: SelectedItem;
  onSelectItem: (item: SelectedItem) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  payload: SharedPayload;
}

function FolderTree({
  folders,
  requests,
  parentId,
  depth,
  selectedItem,
  onSelectItem,
  expandedFolders,
  onToggleFolder,
  payload,
}: FolderTreeProps): ReactElement {
  const childFolders = folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childRequests = requests
    .filter((r) => r.folderId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {childFolders.map((folder) => {
        const folderHasChildren =
          folders.some((f) => f.parentId === folder.id) ||
          requests.some((r) => r.folderId === folder.id);
        const isExpanded = expandedFolders.has(folder.id);
        const isSelected =
          selectedItem.type === "folder" && selectedItem.folderId === folder.id;

        return (
          <div key={folder.id}>
            <SidebarItem
              item={folder}
              isSelected={isSelected}
              isFolder={true}
              isExpanded={isExpanded}
              hasChildren={folderHasChildren}
              onSelect={() => onSelectItem({ type: "folder", folderId: folder.id })}
              onToggle={() => onToggleFolder(folder.id)}
              depth={depth}
              payload={payload}
            />
            {isExpanded && (
              <FolderTree
                folders={folders}
                requests={requests}
                parentId={folder.id}
                depth={depth + 1}
                selectedItem={selectedItem}
                onSelectItem={onSelectItem}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                payload={payload}
              />
            )}
          </div>
        );
      })}

      {childRequests.map((request) => {
        const isSelected =
          selectedItem.type === "request" && selectedItem.requestId === request.id;

        return (
          <SidebarItem
            key={request.id}
            item={request}
            isSelected={isSelected}
            isFolder={false}
            isExpanded={false}
            hasChildren={false}
            onSelect={() => onSelectItem({ type: "request", requestId: request.id })}
            onToggle={() => {}}
            depth={depth}
            payload={payload}
          />
        );
      })}
    </>
  );
}

function OverviewPanel({
  collection,
  folder,
}: {
  collection: SharedCollectionInfo;
  folder?: SharedFolder;
}): ReactElement {
  const item = folder || collection;
  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16, fontWeight: 600 }}>
        {item.name}
      </h2>
      {item.description ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          {item.description}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>No description available.</p>
      )}
    </div>
  );
}

function RequestDetailsPanel({
  request,
}: {
  request: SharedRequest;
}): ReactElement {
  const methodColor = getMethodColor(request.method);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            borderRadius: 4,
            background: `${methodColor}20`,
            color: methodColor,
            fontWeight: 700,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
          }}
        >
          {request.method.toUpperCase()}
        </span>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 18, marginBottom: 4, fontWeight: 600 }}>
            {request.name}
          </h2>
          {request.description && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {request.description}
            </p>
          )}
        </div>
      </div>

      {/* URL */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--muted)" }}>
          URL
        </h3>
        <div
          style={{
            padding: 10,
            background: "var(--surface)",
            borderRadius: 4,
            border: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-secondary)",
            wordBreak: "break-all",
          }}
        >
          {request.url}
        </div>
      </div>

      {/* Parse URL for params */}
      {(() => {
        try {
          const urlObj = new URL(
            request.url.replace(/\{\{([^}]+)\}\}/g, "http://localhost")
          );
          const params: Array<{ key: string; value: string }> = [];
          urlObj.searchParams.forEach((value, key) => {
            params.push({ key, value });
          });

          if (params.length > 0) {
            return (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--muted)" }}>
                  Query Parameters
                </h3>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: "var(--muted)" }}>
                          Key
                        </th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: "var(--muted)" }}>
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {params.map((param, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 10px", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                            {param.key}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 12 }}>
                            {param.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
        } catch {
          // Skip if URL parsing fails
        }
        return null;
      })()}
    </div>
  );
}

export default function SharedCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): ReactElement {
  const { slug } = use(params);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({
    type: "collection",
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    async function loadSharedCollection() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/share/${slug}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as
          | { data?: SharedPayload; error?: string }
          | null;

        if (!response.ok || !body?.data) {
          throw new Error(body?.error || "Shared collection not found.");
        }

        if (mounted) {
          setPayload(body.data);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Unable to load shared collection.";
        if (mounted) {
          setPayload(null);
          setError(message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadSharedCollection();

    return () => {
      mounted = false;
    };
  }, [slug]);

  const handleToggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleDownload = async () => {
    if (!payload) return;
    try {
      const postmanCollection = buildPostmanCollection(payload);
      const blob = new Blob([JSON.stringify(postmanCollection, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${payload.collection.name || "shared-collection"}.postman_collection.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download shared collection.");
    }
  };

  const currentFolder =
    selectedItem.type === "folder"
      ? payload?.folders.find((f) => f.id === selectedItem.folderId)
      : undefined;

  const currentRequest =
    selectedItem.type === "request"
      ? payload?.requests.find((r) => r.id === selectedItem.requestId)
      : undefined;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Bar */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          background: "var(--bg-elevated)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Octoman</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="pm-btn pm-btn-primary"
            onClick={() => void handleDownload()}
          >
            Download JSON
          </button>
          <Link
            href="/login"
            className="pm-btn pm-btn-secondary"
            style={{ textDecoration: "none" }}
          >
            Open App
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside
          style={{
            width: 260,
            borderRight: "1px solid var(--border)",
            overflow: "auto",
            background: "var(--bg-elevated)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
            <div
              onClick={() => setSelectedItem({ type: "collection" })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 4,
                cursor: "pointer",
                background:
                  selectedItem.type === "collection"
                    ? "rgba(73, 204, 144, 0.1)"
                    : "transparent",
                borderLeft:
                  selectedItem.type === "collection"
                    ? "3px solid #49cc90"
                    : "3px solid transparent",
                fontSize: 12,
                fontWeight: selectedItem.type === "collection" ? 600 : 400,
                color:
                  selectedItem.type === "collection"
                    ? "var(--text)"
                    : "var(--text-secondary)",
                transition: "all 0.15s",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  selectedItem.type === "collection"
                    ? "rgba(73, 204, 144, 0.15)"
                    : "rgba(255, 255, 255, 0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  selectedItem.type === "collection"
                    ? "rgba(73, 204, 144, 0.1)"
                    : "transparent";
              }}
            >
              <span style={{ fontSize: 14 }}>📦</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {payload?.collection.name || "Collection"}
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
            {loading ? (
              <p style={{ fontSize: 12, color: "var(--muted)", padding: 12 }}>
                Loading...
              </p>
            ) : error ? (
              <p style={{ fontSize: 12, color: "var(--error)", padding: 12 }}>
                Error loading collection
              </p>
            ) : payload ? (
              <FolderTree
                folders={payload.folders}
                requests={payload.requests}
                parentId={null}
                depth={0}
                selectedItem={selectedItem}
                onSelectItem={setSelectedItem}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                payload={payload}
              />
            ) : null}
          </div>
        </aside>

        {/* Main Content Area */}
        <main
          style={{
            flex: 1,
            overflow: "auto",
            padding: 32,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {loading ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Loading shared collection...
            </p>
          ) : error ? (
            <div
              style={{
                border: "1px solid color-mix(in srgb, var(--error) 30%, var(--border))",
                background: "color-mix(in srgb, var(--error) 10%, var(--surface))",
                color: "var(--text)",
                borderRadius: 8,
                padding: 16,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : payload ? (
            <>
              {selectedItem.type === "collection" ? (
                <OverviewPanel collection={payload.collection} />
              ) : selectedItem.type === "folder" && currentFolder ? (
                <OverviewPanel
                  collection={payload.collection}
                  folder={currentFolder}
                />
              ) : selectedItem.type === "request" && currentRequest ? (
                <RequestDetailsPanel request={currentRequest} />
              ) : (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>
                  Select an item from the sidebar.
                </p>
              )}
            </>
          ) : null}
        </main>
      </div>
    </main>
  );
}

function buildPostmanCollection(payload: SharedPayload) {
  const rootFolders = payload.folders.filter((f) => f.parentId === null);
  const rootRequests = payload.requests.filter((r) => r.folderId === null);

  return {
    info: {
      name: payload.collection.name,
      description: payload.collection.description ?? "",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      ...rootFolders.map((f) =>
        buildFolderItem(f, payload.folders, payload.requests)
      ),
      ...rootRequests.map(buildRequestItem),
    ],
  };
}

function buildFolderItem(
  folder: SharedFolder,
  allFolders: SharedFolder[],
  allRequests: SharedRequest[]
): any {
  const childFolders = allFolders.filter((f) => f.parentId === folder.id);
  const folderRequests = allRequests.filter((r) => r.folderId === folder.id);

  return {
    name: folder.name,
    ...(folder.description ? { description: folder.description } : {}),
    item: [
      ...childFolders.map((cf) =>
        buildFolderItem(cf, allFolders, allRequests)
      ),
      ...folderRequests.map(buildRequestItem),
    ],
  };
}

function buildRequestItem(req: SharedRequest) {
  return {
    name: req.name,
    request: {
      method: req.method.toUpperCase(),
      header: [],
      url: parsePostmanUrl(req.url),
      ...(req.description ? { description: req.description } : {}),
    },
    response: [],
  };
}

function parsePostmanUrl(raw: string): { raw: string; host: string[]; protocol?: string; port?: string; path?: string[]; query?: Array<{ key: string; value: string }> } {
  const safeRaw = raw?.trim() || "";

  const envMatch = safeRaw.match(
    /^(\{\{[^}]+\}\})(\/[^?#]*)?([?#].*)?$/
  );
  if (envMatch) {
    const hostVar = envMatch[1];
    const pathStr = envMatch[2] ?? "";
    const queryStr = envMatch[3] ?? "";

    const path = pathStr.replace(/^\//, "").split("/").filter(Boolean);
    const query = queryStr.startsWith("?")
      ? queryStr
          .slice(1)
          .split("&")
          .filter(Boolean)
          .map((p) => {
            const eqIdx = p.indexOf("=");
            return eqIdx === -1
              ? { key: p, value: "" }
              : { key: p.slice(0, eqIdx), value: p.slice(eqIdx + 1) };
          })
      : [];

    return {
      raw: safeRaw,
      host: [hostVar],
      ...(path.length > 0 ? { path } : {}),
      ...(query.length > 0 ? { query } : {}),
    };
  }

  try {
    const u = new URL(safeRaw);
    const path = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    const query: Array<{ key: string; value: string }> = [];
    u.searchParams.forEach((value, key) => query.push({ key, value }));

    return {
      raw: safeRaw,
      protocol: u.protocol.replace(":", ""),
      host: u.hostname.split("."),
      ...(u.port ? { port: u.port } : {}),
      ...(path.length > 0 ? { path } : {}),
      ...(query.length > 0 ? { query } : {}),
    };
  } catch {
    return { raw: safeRaw, host: [safeRaw] };
  }
}
