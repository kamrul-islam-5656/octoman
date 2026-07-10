import { Dispatch, SetStateAction } from "react";
import { AlertTriangle, FileJson2, LoaderCircle, Plus, Save, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/ui/CodeEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CollectionDto, DocumentationFolderDto, HttpMethod, KeyValuePair, RequestBodyMode } from "@/types";

import { AuthEditor } from "./AuthEditor";
import { BuilderState, RequestEditorTabId } from "./types";
import { VariableAwareInput } from "./VariableAwareInput";
import {
  AuthOwnerRef,
  bodyModes,
  buildUrlWithQueryParams,
  getJsonParseError,
  mergeQueryParamsFromUrl,
  methods,
  resolveEffectiveAuth,
} from "./utils";

interface RequestEditorPanelProps {
  builder: BuilderState;
  setBuilder: Dispatch<SetStateAction<BuilderState>>;
  isReadonly: boolean;
  isSavingRequest: boolean;
  isDeletingRequest: boolean;
  isExecuting: boolean;
  requestEditorTab: RequestEditorTabId;
  setRequestEditorTab: (tab: RequestEditorTabId) => void;
  showCookiesEditor: boolean;
  setShowCookiesEditor: Dispatch<SetStateAction<boolean>>;
  requestCookies: KeyValuePair[];
  setRequestCookies: Dispatch<SetStateAction<KeyValuePair[]>>;
  collections: CollectionDto[];
  folders: DocumentationFolderDto[];
  activeFolderPath: DocumentationFolderDto[];
  requestPathSegments: string[];
  scriptDraft: string;
  setScriptDraft: (value: string) => void;
  environmentVariableKeys: string[];
  onNavigateToAuthOwner: (owner: AuthOwnerRef) => void;
  onStartNewRequest: () => void;
  onSaveRequest: () => void;
  onDeleteRequest: () => void;
  onExecuteRequest: () => void;
}

export function RequestEditorPanel({
  builder,
  setBuilder,
  isReadonly,
  isSavingRequest,
  isDeletingRequest,
  isExecuting,
  requestEditorTab,
  setRequestEditorTab,
  showCookiesEditor,
  setShowCookiesEditor,
  requestCookies,
  setRequestCookies,
  collections,
  folders,
  activeFolderPath,
  requestPathSegments,
  scriptDraft,
  setScriptDraft,
  environmentVariableKeys,
  onNavigateToAuthOwner,
  onStartNewRequest,
  onSaveRequest,
  onDeleteRequest,
  onExecuteRequest,
}: RequestEditorPanelProps) {
  const bodyJsonError =
    builder.bodyMode === "raw" && builder.bodyRaw.trim()
      ? getJsonParseError(builder.bodyRaw)
      : null;

  return (
    <section className="flex h-full flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Button type="button" variant="secondary" size="sm" onClick={onStartNewRequest}>
          New Request
        </Button>

        {!isReadonly ? (
          <Button type="button" variant="secondary" size="sm" onClick={onSaveRequest} disabled={isSavingRequest}>
            {isSavingRequest ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
            Save
          </Button>
        ) : null}

        {!isReadonly && builder.id ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDeleteRequest}
            disabled={isDeletingRequest}
          >
            {isDeletingRequest ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
            Delete
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1 px-4 pt-2 text-xs text-[var(--muted)]">
        <FileJson2 size={13} className="text-[var(--primary)]" />
        {requestPathSegments.map((segment, index) => (
          <span key={`${segment}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 ? <span className="text-[var(--muted)]/60">/</span> : null}
            <span className={index === requestPathSegments.length - 1 ? "text-[var(--text)]" : ""}>
              {segment}
            </span>
          </span>
        ))}
      </div>

      <div className="grid gap-2 px-4 py-3 md:grid-cols-[120px_1fr_auto]">
        <select
          value={builder.method}
          onChange={(event) =>
            setBuilder((previous) => ({
              ...previous,
              method: event.target.value as HttpMethod,
            }))
          }
          className="odl-input font-mono"
        >
          {methods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        <VariableAwareInput
          value={builder.url}
          onChange={(nextUrl) => {
            setBuilder((previous) => ({
              ...previous,
              url: nextUrl,
              queryParams: mergeQueryParamsFromUrl(nextUrl, previous.queryParams),
            }));
          }}
          environmentVariableKeys={environmentVariableKeys}
          className="odl-input-1 font-mono"
          placeholder="{{base_url}}/v1/resource"
        />

        <Button type="button" onClick={onExecuteRequest} disabled={isExecuting}>
          {isExecuting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
          Execute
        </Button>
      </div>

      <div className="odl-tabbar px-4">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className={`odl-tab ${requestEditorTab === "params" ? "odl-tab-active" : ""}`}
            onClick={() => setRequestEditorTab("params")}
          >
            Params
            {builder.queryParams.filter((param) => param.key.trim()).length > 0
              ? ` (${builder.queryParams.filter((param) => param.key.trim()).length})`
              : ""}
          </button>
          <button
            type="button"
            className={`odl-tab ${requestEditorTab === "docs" ? "odl-tab-active" : ""}`}
            onClick={() => setRequestEditorTab("docs")}
          >
            Docs
          </button>
          <button
            type="button"
            className={`odl-tab ${requestEditorTab === "auth" ? "odl-tab-active" : ""}`}
            onClick={() => setRequestEditorTab("auth")}
          >
            Auth
          </button>
          <button
            type="button"
            className={`odl-tab ${requestEditorTab === "headers" ? "odl-tab-active" : ""}`}
            onClick={() => setRequestEditorTab("headers")}
          >
            Headers
          </button>
          <button
            type="button"
            className={`odl-tab ${requestEditorTab === "body" ? "odl-tab-active" : ""}`}
            onClick={() => setRequestEditorTab("body")}
          >
            Body
          </button>
          <button
            type="button"
            className={`odl-tab ${requestEditorTab === "scripts" ? "odl-tab-active" : ""}`}
            onClick={() => setRequestEditorTab("scripts")}
          >
            Scripts
          </button>
        </div>

        <button
          type="button"
          className={`odl-tab ${showCookiesEditor ? "odl-tab-active" : ""}`}
          onClick={() => setShowCookiesEditor((previous) => !previous)}
        >
          Cookies
          {requestCookies.filter((cookie) => cookie.key.trim()).length > 0
            ? ` (${requestCookies.filter((cookie) => cookie.key.trim()).length})`
            : ""}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
      {showCookiesEditor ? (
        <div className="mb-3 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Request Cookies
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                setRequestCookies((previous) => [...previous, { key: "", value: "", enabled: true }])
              }
              title="Add cookie"
            >
              <Plus size={14} />
            </Button>
          </div>

          {requestCookies.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              No cookies configured. Add key/value cookies to include them in requests.
            </p>
          ) : (
            <div className="space-y-2">
              {requestCookies.map((cookie, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    className="text-xs font-mono"
                    placeholder="Cookie key"
                    value={cookie.key}
                    onChange={(event) =>
                      setRequestCookies((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    className="text-xs font-mono"
                    placeholder="Cookie value"
                    value={cookie.value}
                    onChange={(event) =>
                      setRequestCookies((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setRequestCookies((previous) =>
                        previous.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {requestEditorTab === "params" ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Query Params
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                setBuilder((previous) => {
                  const nextParams = [...previous.queryParams, { key: "", value: "", enabled: true }];
                  return {
                    ...previous,
                    queryParams: nextParams,
                    url: buildUrlWithQueryParams(previous.url, nextParams),
                  };
                })
              }
            >
              <Plus size={14} />
            </Button>
          </div>

          {builder.queryParams.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              No query params yet. Add one here or type a URL with a query string.
            </p>
          ) : (
            <div className="space-y-2">
              {builder.queryParams.map((param, index) => (
                <div key={index} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                  <input
                    type="checkbox"
                    checked={param.enabled !== false}
                    onChange={(event) =>
                      setBuilder((previous) => {
                        const nextParams = previous.queryParams.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, enabled: event.target.checked } : item,
                        );
                        return {
                          ...previous,
                          queryParams: nextParams,
                          url: buildUrlWithQueryParams(previous.url, nextParams),
                        };
                      })
                    }
                  />
                  <Input
                    className="text-xs font-mono"
                    placeholder="Param key"
                    value={param.key}
                    onChange={(event) =>
                      setBuilder((previous) => {
                        const nextParams = previous.queryParams.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: event.target.value } : item,
                        );
                        return {
                          ...previous,
                          queryParams: nextParams,
                          url: buildUrlWithQueryParams(previous.url, nextParams),
                        };
                      })
                    }
                  />
                  <VariableAwareInput
                    className="odl-input-1 text-xs font-mono"
                    placeholder="Param value"
                    value={param.value}
                    environmentVariableKeys={environmentVariableKeys}
                    onChange={(nextValue) =>
                      setBuilder((previous) => {
                        const nextParams = previous.queryParams.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value: nextValue } : item,
                        );
                        return {
                          ...previous,
                          queryParams: nextParams,
                          url: buildUrlWithQueryParams(previous.url, nextParams),
                        };
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setBuilder((previous) => {
                        const nextParams = previous.queryParams.filter((_, itemIndex) => itemIndex !== index);
                        return {
                          ...previous,
                          queryParams: nextParams,
                          url: buildUrlWithQueryParams(previous.url, nextParams),
                        };
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {requestEditorTab === "docs" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Request Name
              </label>
              <Input
                value={builder.name}
                onChange={(event) => setBuilder((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Get user profile"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Collection
              </label>
              <select
                value={builder.collectionId ?? ""}
                onChange={(event) =>
                  setBuilder((previous) => ({
                    ...previous,
                    collectionId: event.target.value || null,
                    folderId: null,
                  }))
                }
                className="odl-input"
              >
                <option value="">No collection</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              {activeFolderPath.length > 0 ? (
                <p className="text-[11px] text-[var(--muted)]">
                  Folder: {activeFolderPath.map((folder) => folder.name).join(" / ")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Description
            </label>
            <Input
              value={builder.description}
              onChange={(event) =>
                setBuilder((previous) => ({ ...previous, description: event.target.value }))
              }
              placeholder="Optional request notes"
            />
          </div>
        </>
      ) : null}

      {requestEditorTab === "auth" ? (
        <AuthEditor
          auth={builder.auth}
          onChange={(auth) => setBuilder((previous) => ({ ...previous, auth }))}
          allowInherit
          isReadonly={isReadonly}
          resolvedAuth={
            builder.auth.type === "inherit"
              ? resolveEffectiveAuth(builder.folderId, builder.collectionId, folders, collections)
              : null
          }
          onNavigateToOwner={onNavigateToAuthOwner}
          environmentVariableKeys={environmentVariableKeys}
        />
      ) : null}

      {requestEditorTab === "headers" ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Headers</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                setBuilder((previous) => ({
                  ...previous,
                  headers: [...previous.headers, { key: "", value: "", enabled: true }],
                }))
              }
            >
              <Plus size={14} />
            </Button>
          </div>

          <div className="space-y-2">
            {builder.headers.map((header, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  className="text-xs font-mono"
                  placeholder="Header key"
                  value={header.key}
                  onChange={(event) =>
                    setBuilder((previous) => ({
                      ...previous,
                      headers: previous.headers.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <VariableAwareInput
                  className="odl-input text-xs font-mono"
                  placeholder="Header value"
                  value={header.value}
                  environmentVariableKeys={environmentVariableKeys}
                  onChange={(nextValue) =>
                    setBuilder((previous) => ({
                      ...previous,
                      headers: previous.headers.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: nextValue } : item,
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setBuilder((previous) => ({
                      ...previous,
                      headers: previous.headers.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {requestEditorTab === "body" ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Body Mode
            </p>
            <select
              value={builder.bodyMode}
              onChange={(event) =>
                setBuilder((previous) => ({
                  ...previous,
                  bodyMode: event.target.value as RequestBodyMode,
                }))
              }
              className="odl-input"
            >
              {bodyModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

          {builder.bodyMode === "raw" ? (
            <div className="overflow-hidden rounded-md border border-[var(--border)]">
              <CodeEditor
                value={builder.bodyRaw}
                onChange={(value) =>
                  setBuilder((previous) => ({
                    ...previous,
                    bodyRaw: value,
                  }))
                }
                language="json"
                minHeight="208px"
                placeholder="{ }"
              />
            </div>
          ) : null}

          {bodyJsonError ? (
            <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-100/60 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="break-all font-mono">{bodyJsonError}</span>
            </div>
          ) : null}

          {builder.bodyMode === "form-data" || builder.bodyMode === "x-www-form-urlencoded" ? (
            <div className="space-y-2">
              {builder.bodyForm.map((field, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    className="text-xs font-mono"
                    placeholder="Field key"
                    value={field.key}
                    onChange={(event) =>
                      setBuilder((previous) => ({
                        ...previous,
                        bodyForm: previous.bodyForm.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <Input
                    className="text-xs font-mono"
                    placeholder="Field value"
                    value={field.value}
                    onChange={(event) =>
                      setBuilder((previous) => ({
                        ...previous,
                        bodyForm: previous.bodyForm.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setBuilder((previous) => ({
                        ...previous,
                        bodyForm: previous.bodyForm.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setBuilder((previous) => ({
                    ...previous,
                    bodyForm: [...previous.bodyForm, { key: "", value: "", enabled: true }],
                  }))
                }
              >
                <Plus size={14} />
                Add Field
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {requestEditorTab === "scripts" ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Post Response Scripts
          </p>
          <Textarea
            value={scriptDraft}
            onChange={(event) => setScriptDraft(event.target.value)}
            className="h-52 font-mono"
            placeholder="Write JavaScript assertions or helpers"
          />
        </div>
      ) : null}
      </div>

    </section>
  );
}
