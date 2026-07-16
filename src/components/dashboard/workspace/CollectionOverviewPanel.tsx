import { useEffect, useState } from "react";
import { FileJson2, Folder, FolderKanban, Globe, LoaderCircle, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CollectionDto, DocumentationFolderDto, EnvironmentDto, EnvironmentVariable, RequestAuthConfig, RequestDto } from "@/types";

import { AuthEditor } from "./AuthEditor";
import { CollectionEnvironmentsPanel } from "./CollectionEnvironmentsPanel";
import { GenerateDocumentationModal } from "./GenerateDocumentationModal";
import {
  AuthOwnerRef,
  countCollectionContents,
  countFolderContents,
  getActiveEnvironmentForCollection,
  getEnvironmentVariableKeys,
  getFolderAncestry,
  resolveEffectiveAuth,
} from "./utils";

export type DetailViewTarget =
  | { type: "collection"; collection: CollectionDto }
  | { type: "folder"; folder: DocumentationFolderDto };

export type DetailTabId = "overview" | "authorization" | "environment";

interface CollectionOverviewPanelProps {
  target: DetailViewTarget;
  collections: CollectionDto[];
  folders: DocumentationFolderDto[];
  requests: RequestDto[];
  environments: EnvironmentDto[];
  isReadonly: boolean;
  detailTab: DetailTabId;
  setDetailTab: (tab: DetailTabId) => void;
  onOpenAiSettings: () => void;
  onUpdateDescription: (value: string) => Promise<void>;
  onUpdateAuth: (auth: RequestAuthConfig) => Promise<void>;
  onNavigateToOwner: (owner: AuthOwnerRef) => void;
  isCreatingEnvironment: boolean;
  settingActiveEnvironmentId: string | null;
  isSavingEnvironmentVariables: boolean;
  deletingEnvironmentId: string | null;
  onCreateEnvironment: (collectionId: string, name: string) => void;
  onSetActiveEnvironment: (environmentId: string) => void;
  onSaveEnvironmentVariables: (environmentId: string, variables: EnvironmentVariable[]) => void;
  onDeleteEnvironment: (environmentId: string) => void;
}

export function CollectionOverviewPanel({
  target,
  collections,
  folders,
  requests,
  environments,
  isReadonly,
  detailTab,
  setDetailTab,
  onOpenAiSettings,
  onUpdateDescription,
  onUpdateAuth,
  onNavigateToOwner,
  isCreatingEnvironment,
  settingActiveEnvironmentId,
  isSavingEnvironmentVariables,
  deletingEnvironmentId,
  onCreateEnvironment,
  onSetActiveEnvironment,
  onSaveEnvironmentVariables,
  onDeleteEnvironment,
}: CollectionOverviewPanelProps) {
  const targetId = target.type === "collection" ? target.collection.id : target.folder.id;
  const name = target.type === "collection" ? target.collection.name : target.folder.name;
  const description = target.type === "collection" ? target.collection.description : target.folder.description;
  const auth = target.type === "collection" ? target.collection.auth : target.folder.auth;

  const [descriptionDraft, setDescriptionDraft] = useState(description);
  const [authDraft, setAuthDraft] = useState(auth);
  const [isSaving, setIsSaving] = useState(false);
  const [showDocumentationModal, setShowDocumentationModal] = useState(false);

  useEffect(() => {
    setDescriptionDraft(description);
    setAuthDraft(auth);
    // Only re-sync drafts when switching to a different collection/folder — not on every
    // parent re-render (e.g. our own save echoing back), which would clobber in-progress typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const isDirty = descriptionDraft !== description || JSON.stringify(authDraft) !== JSON.stringify(auth);

  async function handleSave() {
    setIsSaving(true);
    try {
      if (descriptionDraft !== description) {
        await onUpdateDescription(descriptionDraft);
      }
      if (JSON.stringify(authDraft) !== JSON.stringify(auth)) {
        await onUpdateAuth(authDraft);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const counts =
    target.type === "collection"
      ? countCollectionContents(target.collection.id, folders, requests)
      : countFolderContents(target.folder.id, folders, requests);

  const breadcrumbSegments: string[] =
    target.type === "collection"
      ? [target.collection.name]
      : (() => {
          const collection = collections.find((item) => item.id === target.folder.collection_id);
          const ancestry = getFolderAncestry(target.folder.id, folders);
          return [collection?.name ?? "Workspace", ...ancestry.map((folder) => folder.name)];
        })();

  const resolvedAuth =
    authDraft.type === "inherit"
      ? resolveEffectiveAuth(
          target.type === "folder" ? target.folder.parent_id : null,
          target.type === "folder" ? target.folder.collection_id : null,
          folders,
          collections,
        )
      : null;

  const ownerCollectionId = target.type === "collection" ? target.collection.id : target.folder.collection_id;
  const environment = getActiveEnvironmentForCollection(environments, ownerCollectionId);
  const environmentVariableKeys = getEnvironmentVariableKeys(environment);
  const collectionEnvironments =
    target.type === "collection"
      ? environments.filter((item) => item.collection_id === target.collection.id)
      : [];

  return (
    <section className="flex h-full flex-col overflow-auto border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
        {target.type === "collection" ? (
          <FolderKanban size={13} className="text-[var(--tree-collection)]" />
        ) : (
          <Folder size={13} className="text-[var(--tree-folder)]" />
        )}
        {breadcrumbSegments.map((segment, index) => (
          <span key={`${segment}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 ? <span className="text-[var(--muted)]/60">/</span> : null}
            <span className={index === breadcrumbSegments.length - 1 ? "font-semibold text-[var(--text)]" : ""}>
              {segment}
            </span>
          </span>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--text)]">{name}</h2>

        <div className="flex items-center gap-2">
          {target.type === "collection" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowDocumentationModal(true)}
            >
              <Sparkles size={14} />
              API Docs
            </Button>
          ) : null}

          {!isReadonly ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isDirty || isSaving}
              onClick={() => void handleSave()}
            >
              {isSaving ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />}
              Save{isDirty ? "" : "d"}
            </Button>
          ) : null}
        </div>
      </div>

      {showDocumentationModal && target.type === "collection" ? (
        <GenerateDocumentationModal
          collectionId={target.collection.id}
          collectionName={target.collection.name}
          onClose={() => setShowDocumentationModal(false)}
          onOpenAiSettings={() => {
            setShowDocumentationModal(false);
            onOpenAiSettings();
          }}
        />
      ) : null}

      <div className="odl-tabbar mb-3">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className={`odl-tab ${detailTab === "overview" ? "odl-tab-active" : ""}`}
            onClick={() => setDetailTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={`odl-tab ${detailTab === "authorization" ? "odl-tab-active" : ""}`}
            onClick={() => setDetailTab("authorization")}
          >
            Authorization
          </button>
          {target.type === "collection" ? (
            <button
              type="button"
              className={`odl-tab ${detailTab === "environment" ? "odl-tab-active" : ""}`}
              onClick={() => setDetailTab("environment")}
            >
              <span className="inline-flex items-center gap-1.5">
                <Globe size={12} />
                Environment
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {detailTab === "overview" ? (
        <div className="space-y-4 pt-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Description
            </label>
            <Textarea
              value={descriptionDraft}
              disabled={isReadonly}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              className="h-28"
              placeholder="Add a description"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/70 px-3 py-2">
              <Folder size={14} className="text-[var(--tree-folder)]" />
              <span className="text-sm">
                <span className="font-semibold">{counts.folderCount}</span>{" "}
                {counts.folderCount === 1 ? "folder" : "folders"}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/70 px-3 py-2">
              <FileJson2 size={14} className="text-[var(--primary)]" />
              <span className="text-sm">
                <span className="font-semibold">{counts.requestCount}</span>{" "}
                {counts.requestCount === 1 ? "request" : "requests"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {detailTab === "authorization" ? (
        <div className="pt-3">
          <AuthEditor
            auth={authDraft}
            onChange={setAuthDraft}
            allowInherit={target.type === "folder"}
            isReadonly={isReadonly}
            resolvedAuth={resolvedAuth}
            onNavigateToOwner={onNavigateToOwner}
            environmentVariableKeys={environmentVariableKeys}
          />
        </div>
      ) : null}

      {detailTab === "environment" && target.type === "collection" ? (
        <CollectionEnvironmentsPanel
          environments={collectionEnvironments}
          isReadonly={isReadonly}
          isCreatingEnvironment={isCreatingEnvironment}
          settingActiveEnvironmentId={settingActiveEnvironmentId}
          isSavingEnvironmentVariables={isSavingEnvironmentVariables}
          deletingEnvironmentId={deletingEnvironmentId}
          onCreateEnvironment={(name) => onCreateEnvironment(target.collection.id, name)}
          onSetActiveEnvironment={onSetActiveEnvironment}
          onSaveEnvironmentVariables={onSaveEnvironmentVariables}
          onDeleteEnvironment={onDeleteEnvironment}
        />
      ) : null}
    </section>
  );
}
