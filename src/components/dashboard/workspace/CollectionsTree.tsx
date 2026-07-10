import { ReactElement, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileJson2,
  Folder,
  FolderKanban,
  FolderOpen,
  MoreVertical,
  Plus,
  Search,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionDto, DocumentationFolderDto, RequestDto } from "@/types";

import { TreeContextMenuPayload } from "./types";
import { getMethodColor, NO_COLLECTION_KEY, ROOT_NODE_KEY, treeIndent } from "./utils";

interface CollectionsTreeProps {
  collections: CollectionDto[];
  folders: DocumentationFolderDto[];
  requests: RequestDto[];
  organizationName: string;
  isReadonly: boolean;
  collectionFilter: string;
  folderFilter: string;
  activeRequestId: string | null;
  expandedCollectionIds: Record<string, boolean>;
  expandedFolderIds: Record<string, boolean>;
  onToggleCollectionExpanded: (collectionId: string) => void;
  onToggleFolderExpanded: (folderId: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectRequest: (request: RequestDto) => void;
  onResetFilters: () => void;
  onOpenContextMenu: (
    event: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number },
    payload: TreeContextMenuPayload,
  ) => void;
  onCreateCollection: () => void;
  canImportCollection: boolean;
  onImportCollection: () => void;
}

export function CollectionsTree({
  collections,
  folders,
  requests,
  organizationName,
  isReadonly,
  collectionFilter,
  folderFilter,
  activeRequestId,
  expandedCollectionIds,
  expandedFolderIds,
  onToggleCollectionExpanded,
  onToggleFolderExpanded,
  onSelectCollection,
  onSelectFolder,
  onSelectRequest,
  onResetFilters,
  onOpenContextMenu,
  onCreateCollection,
  canImportCollection,
  onImportCollection,
}: CollectionsTreeProps) {
  const [collectionSearch, setCollectionSearch] = useState("");
  const treeSearchQuery = collectionSearch.trim().toLowerCase();

  const folderChildrenByParent = useMemo(() => {
    const byParent = new Map<string | null, DocumentationFolderDto[]>();

    folders.forEach((folder) => {
      const key = folder.parent_id;
      const bucket = byParent.get(key) ?? [];
      bucket.push(folder);
      byParent.set(key, bucket);
    });

    byParent.forEach((items) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
    });

    return byParent;
  }, [folders]);

  const requestsByCollectionAndFolder = useMemo(() => {
    const byNode = new Map<string, RequestDto[]>();

    requests.forEach((request) => {
      const collectionKey = request.collection_id ?? NO_COLLECTION_KEY;
      const folderKey = request.folder_id ?? ROOT_NODE_KEY;
      const nodeKey = `${collectionKey}::${folderKey}`;
      const bucket = byNode.get(nodeKey) ?? [];
      bucket.push(request);
      byNode.set(nodeKey, bucket);
    });

    byNode.forEach((items) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
    });

    return byNode;
  }, [requests]);

  function matchesTreeSearch(value: string): boolean {
    if (!treeSearchQuery) {
      return true;
    }

    return value.toLowerCase().includes(treeSearchQuery);
  }

  function isCollectionExpanded(collectionId: string): boolean {
    if (treeSearchQuery) {
      return true;
    }

    return expandedCollectionIds[collectionId] ?? true;
  }

  function isFolderExpanded(folderId: string): boolean {
    if (treeSearchQuery) {
      return true;
    }

    return expandedFolderIds[folderId] ?? true;
  }

  function renderRequestNode(request: RequestDto, depth: number) {
    return (
      <div
        key={request.id}
        className="group flex items-center gap-1"
        style={{ paddingLeft: treeIndent(depth) }}
      >
        <span className="inline-flex h-7 w-7 shrink-0" />
        <button
          type="button"
          onClick={() => onSelectRequest(request)}
          onContextMenu={(event) => onOpenContextMenu(event, { type: "request", request })}
          className={`odl-list-item flex-1 text-left ${activeRequestId === request.id ? "odl-list-item-active" : ""}`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <FileJson2 size={12} className="shrink-0" style={{ color: getMethodColor(request.method) }} />
            <span
              className="font-mono text-[11px] font-semibold"
              style={{ color: getMethodColor(request.method) }}
            >
              {request.method}
            </span>
            <span className="truncate text-xs">{request.name}</span>
          </span>
        </button>
        {!isReadonly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            title="More options"
            onClick={(event) => onOpenContextMenu(event, { type: "request", request })}
          >
            <MoreVertical size={12} />
          </Button>
        ) : null}
      </div>
    );
  }

  function renderCollectionFolderBranch(
    collectionId: string | null,
    parentId: string | null,
    depth = 0,
  ): ReactElement[] {
    const collectionKey = collectionId ?? NO_COLLECTION_KEY;
    const childFolders = (folderChildrenByParent.get(parentId) ?? []).filter(
      (folder) => (folder.collection_id ?? NO_COLLECTION_KEY) === collectionKey,
    );

    const nodes: ReactElement[] = [];

    childFolders.forEach((folder) => {
      const requestNodeKey = `${collectionKey}::${folder.id}`;
      const nestedRequests = (requestsByCollectionAndFolder.get(requestNodeKey) ?? []).filter(
        (request) => matchesTreeSearch(request.name) || matchesTreeSearch(request.url),
      );
      const nestedFolders = renderCollectionFolderBranch(collectionId, folder.id, depth + 1);
      const hasChildNodes = nestedRequests.length > 0 || nestedFolders.length > 0;
      const expanded = isFolderExpanded(folder.id);

      if (!matchesTreeSearch(folder.name) && nestedRequests.length === 0 && nestedFolders.length === 0) {
        return;
      }

      nodes.push(
        <div key={`${collectionKey}-${folder.id}`} className="space-y-1">
          <div className="group flex items-center gap-1" style={{ paddingLeft: treeIndent(depth) }}>
            {hasChildNodes ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={expanded ? "Collapse folder" : "Expand folder"}
                onClick={() => onToggleFolderExpanded(folder.id)}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </Button>
            ) : (
              <span className="inline-flex h-7 w-7" />
            )}

            <button
              type="button"
              onClick={() => onSelectFolder(folder.id)}
              onContextMenu={(event) => onOpenContextMenu(event, { type: "folder", folder })}
              className={`odl-list-item flex-1 text-left ${folderFilter === folder.id ? "odl-list-item-active" : ""}`}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {expanded ? (
                  <FolderOpen size={13} className="shrink-0" style={{ color: "var(--tree-folder)" }} />
                ) : (
                  <Folder size={13} className="shrink-0" style={{ color: "var(--tree-folder)" }} />
                )}
                <span className="truncate text-sm">{folder.name}</span>
              </span>
            </button>
            {!isReadonly ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                title="More options"
                onClick={(event) => onOpenContextMenu(event, { type: "folder", folder })}
              >
                <MoreVertical size={12} />
              </Button>
            ) : null}
          </div>

          {expanded ? nestedRequests.map((request) => renderRequestNode(request, depth + 1)) : null}

          {expanded ? nestedFolders : null}
        </div>,
      );
    });

    return nodes;
  }

  function renderCollectionNode(collection: CollectionDto) {
    const collectionKey = collection.id;
    const rootNodeKey = `${collectionKey}::${ROOT_NODE_KEY}`;
    const rootRequests = (requestsByCollectionAndFolder.get(rootNodeKey) ?? []).filter(
      (request) => matchesTreeSearch(request.name) || matchesTreeSearch(request.url),
    );
    const nestedFolders = renderCollectionFolderBranch(collection.id, null, 1);
    const hasChildNodes = rootRequests.length > 0 || nestedFolders.length > 0;
    const expanded = isCollectionExpanded(collection.id);

    if (
      !matchesTreeSearch(collection.name) &&
      rootRequests.length === 0 &&
      nestedFolders.length === 0
    ) {
      return null;
    }

    return (
      <div key={collection.id} className="space-y-1">
        <div className="group flex items-center gap-1" style={{ paddingLeft: treeIndent(0) }}>
          {hasChildNodes ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={expanded ? "Collapse collection" : "Expand collection"}
              onClick={() => onToggleCollectionExpanded(collection.id)}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </Button>
          ) : (
            <span className="inline-flex h-7 w-7" />
          )}

          <button
            type="button"
            onClick={() => onSelectCollection(collection.id)}
            onContextMenu={(event) => onOpenContextMenu(event, { type: "collection", collection })}
            className={`odl-list-item flex-1 text-left ${collectionFilter === collection.id ? "odl-list-item-active" : ""}`}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <FolderKanban size={13} className="shrink-0" style={{ color: "var(--tree-collection)" }} />
              <span className="truncate text-sm">{collection.name}</span>
            </span>
          </button>
          {!isReadonly ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              title="More options"
              onClick={(event) => onOpenContextMenu(event, { type: "collection", collection })}
            >
              <MoreVertical size={12} />
            </Button>
          ) : null}
        </div>

        {expanded ? rootRequests.map((request) => renderRequestNode(request, 1)) : null}

        {expanded ? nestedFolders : null}
      </div>
    );
  }

  const unassignedRootNodeKey = `${NO_COLLECTION_KEY}::${ROOT_NODE_KEY}`;
  const unassignedRootRequests = (requestsByCollectionAndFolder.get(unassignedRootNodeKey) ?? []).filter(
    (request) => matchesTreeSearch(request.name) || matchesTreeSearch(request.url),
  );
  const unassignedFolderNodes = renderCollectionFolderBranch(null, null, 1);

  return (
    <section className="space-y-4">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
        />
        <Input
          value={collectionSearch}
          onChange={(event) => setCollectionSearch(event.target.value)}
          className="pl-9 text-sm"
          placeholder="Search collections"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="odl-sidebar-title">
            <FolderKanban size={14} />
            Collections
          </p>

          {!isReadonly ? (
            <div className="flex items-center gap-1">
              {canImportCollection ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Import collection (JSON or Postman export)"
                  onClick={onImportCollection}
                >
                  <Upload size={14} />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="New collection"
                onClick={onCreateCollection}
              >
                <Plus size={14} />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-2 space-y-1">
          <button
            type="button"
            onClick={onResetFilters}
            className={`odl-list-item text-left ${
              collectionFilter === "all" && folderFilter === "all" ? "odl-list-item-active" : ""
            }`}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <FolderKanban size={13} className="shrink-0 text-[var(--muted)]" />
              <span className="truncate text-sm">{organizationName}</span>
            </span>
          </button>

          {collections.map((collection) => renderCollectionNode(collection))}

          {unassignedRootRequests.length > 0 || unassignedFolderNodes.length > 0 ? (
            <div className="space-y-1">
              <p className="px-1 text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">
                Unassigned
              </p>

              {unassignedRootRequests.map((request) => renderRequestNode(request, 1))}

              {unassignedFolderNodes}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
