import { RefObject } from "react";
import { Copy, Download, Edit, Folder, Plus, Trash2 } from "lucide-react";

import { CollectionDto, DocumentationFolderDto, RequestDto } from "@/types";

import { TreeContextMenuState } from "./types";

interface TreeContextMenuProps {
  contextMenu: TreeContextMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onCreateRequestIn: (collectionId: string | null, folderId: string | null) => void;
  onCreateFolderIn: (collectionId: string | null, parentId: string | null) => void;
  onRenameCollection: (collection: CollectionDto) => void;
  onDuplicateCollection: (collection: CollectionDto) => void;
  onExportCollection: (collection: CollectionDto) => void;
  onDeleteCollection: (collection: CollectionDto) => void;
  onRenameFolder: (folder: DocumentationFolderDto) => void;
  onDuplicateFolder: (folder: DocumentationFolderDto) => void;
  onDeleteFolder: (folder: DocumentationFolderDto) => void;
  onRenameRequest: (request: RequestDto) => void;
  onDuplicateRequest: (request: RequestDto) => void;
  onDeleteRequest: (request: RequestDto) => void;
}

export function TreeContextMenu({
  contextMenu,
  menuRef,
  onClose,
  onCreateRequestIn,
  onCreateFolderIn,
  onRenameCollection,
  onDuplicateCollection,
  onExportCollection,
  onDeleteCollection,
  onRenameFolder,
  onDuplicateFolder,
  onDeleteFolder,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
}: TreeContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="pm-context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {contextMenu.type === "collection" ? (
        <>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const collection = contextMenu.collection;
              onClose();
              onCreateRequestIn(collection.id, null);
            }}
          >
            <Plus size={14} />
            Add Request
          </div>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const collection = contextMenu.collection;
              onClose();
              onCreateFolderIn(collection.id, null);
            }}
          >
            <Folder size={14} />
            Add Folder
          </div>
          <div className="pm-context-menu-divider" />
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const collection = contextMenu.collection;
              onClose();
              onRenameCollection(collection);
            }}
          >
            <Edit size={14} />
            Rename
          </div>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const collection = contextMenu.collection;
              onClose();
              onDuplicateCollection(collection);
            }}
          >
            <Copy size={14} />
            Duplicate
          </div>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const collection = contextMenu.collection;
              onClose();
              onExportCollection(collection);
            }}
          >
            <Download size={14} />
            Export
          </div>
          <div className="pm-context-menu-divider" />
          <div
            className="pm-context-menu-item danger"
            onClick={() => {
              const collection = contextMenu.collection;
              onClose();
              onDeleteCollection(collection);
            }}
          >
            <Trash2 size={14} />
            Delete
          </div>
        </>
      ) : null}

      {contextMenu.type === "folder" ? (
        <>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const folder = contextMenu.folder;
              onClose();
              onCreateRequestIn(folder.collection_id, folder.id);
            }}
          >
            <Plus size={14} />
            Add Request
          </div>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const folder = contextMenu.folder;
              onClose();
              onCreateFolderIn(folder.collection_id, folder.id);
            }}
          >
            <Folder size={14} />
            Add Folder
          </div>
          <div className="pm-context-menu-divider" />
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const folder = contextMenu.folder;
              onClose();
              onRenameFolder(folder);
            }}
          >
            <Edit size={14} />
            Rename
          </div>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const folder = contextMenu.folder;
              onClose();
              onDuplicateFolder(folder);
            }}
          >
            <Copy size={14} />
            Duplicate
          </div>
          <div className="pm-context-menu-divider" />
          <div
            className="pm-context-menu-item danger"
            onClick={() => {
              const folder = contextMenu.folder;
              onClose();
              onDeleteFolder(folder);
            }}
          >
            <Trash2 size={14} />
            Delete
          </div>
        </>
      ) : null}

      {contextMenu.type === "request" ? (
        <>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const request = contextMenu.request;
              onClose();
              onRenameRequest(request);
            }}
          >
            <Edit size={14} />
            Rename
          </div>
          <div
            className="pm-context-menu-item"
            onClick={() => {
              const request = contextMenu.request;
              onClose();
              onDuplicateRequest(request);
            }}
          >
            <Copy size={14} />
            Duplicate
          </div>
          <div className="pm-context-menu-divider" />
          <div
            className="pm-context-menu-item danger"
            onClick={() => {
              const request = contextMenu.request;
              onClose();
              onDeleteRequest(request);
            }}
          >
            <Trash2 size={14} />
            Delete
          </div>
        </>
      ) : null}
    </div>
  );
}
