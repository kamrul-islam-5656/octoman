import { ExternalLink } from "lucide-react";

import { Input } from "@/components/ui/input";
import { RequestAuthConfig } from "@/types";

import { AuthOwnerRef } from "./utils";
import { VariableAwareInput } from "./VariableAwareInput";

interface AuthEditorProps {
  auth: RequestAuthConfig;
  onChange: (auth: RequestAuthConfig) => void;
  allowInherit: boolean;
  isReadonly?: boolean;
  resolvedAuth?: { auth: RequestAuthConfig; owner: AuthOwnerRef | null } | null;
  onNavigateToOwner?: (owner: AuthOwnerRef) => void;
  environmentVariableKeys?: string[];
}

function authTypeLabel(type: RequestAuthConfig["type"]): string {
  switch (type) {
    case "inherit":
      return "Inherit auth from parent";
    case "none":
      return "No Auth";
    case "basic":
      return "Basic Auth";
    case "bearer":
      return "Bearer Token";
    case "api-key":
      return "API Key";
    default:
      return type;
  }
}

function ResolvedAuthPreview({ auth }: { auth: RequestAuthConfig }) {
  if (auth.type === "none" || auth.type === "inherit") {
    return <p className="text-xs text-[var(--muted)]">No auth is configured on the parent.</p>;
  }

  if (auth.type === "basic") {
    return (
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Username</p>
          <div className="odl-input border-dashed text-xs font-mono opacity-80">
            {auth.basic.username || "—"}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Password</p>
          <div className="odl-input border-dashed text-xs font-mono opacity-80">
            {auth.basic.password ? "••••••••" : "—"}
          </div>
        </div>
      </div>
    );
  }

  if (auth.type === "bearer") {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Token</p>
        <div className="odl-input border-dashed text-xs font-mono opacity-80">
          {auth.bearerToken || "—"}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Key</p>
        <div className="odl-input border-dashed text-xs font-mono opacity-80">{auth.apiKey.key || "—"}</div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Value</p>
        <div className="odl-input border-dashed text-xs font-mono opacity-80">
          {auth.apiKey.value ? "••••••••" : "—"}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Add to</p>
        <div className="odl-input border-dashed text-xs font-mono opacity-80">{auth.apiKey.addTo}</div>
      </div>
    </div>
  );
}

export function AuthEditor({
  auth,
  onChange,
  allowInherit,
  isReadonly = false,
  resolvedAuth,
  onNavigateToOwner,
  environmentVariableKeys = [],
}: AuthEditorProps) {
  const options = allowInherit
    ? (["inherit", "none", "basic", "bearer", "api-key"] as const)
    : (["none", "basic", "bearer", "api-key"] as const);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Auth Type</p>
        <select
          value={auth.type}
          disabled={isReadonly}
          onChange={(event) => onChange({ ...auth, type: event.target.value as RequestAuthConfig["type"] })}
          className="odl-input"
        >
          {options.map((type) => (
            <option key={type} value={type}>
              {authTypeLabel(type)}
            </option>
          ))}
        </select>
      </div>

      {auth.type === "inherit" ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--muted)]">
            This authorization method will be used for every request here. You can override this by
            specifying one directly. The authorization header will be automatically generated when you
            send the request.
          </p>

          {resolvedAuth ? (
            <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--text)]">
                  {authTypeLabel(resolvedAuth.auth.type)}
                </p>
                {resolvedAuth.owner && onNavigateToOwner ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                    onClick={() => onNavigateToOwner(resolvedAuth.owner as AuthOwnerRef)}
                  >
                    Edit Auth in {resolvedAuth.owner.type === "collection" ? "collection" : "folder"}
                    <ExternalLink size={12} />
                  </button>
                ) : null}
              </div>
              <ResolvedAuthPreview auth={resolvedAuth.auth} />
            </div>
          ) : null}
        </div>
      ) : null}

      {auth.type === "basic" ? (
        <div className="grid gap-2 md:grid-cols-2">
          <VariableAwareInput
            className="odl-input-1 text-xs font-mono"
            placeholder="Username"
            disabled={isReadonly}
            value={auth.basic.username}
            environmentVariableKeys={environmentVariableKeys}
            onChange={(nextValue) => onChange({ ...auth, basic: { ...auth.basic, username: nextValue } })}
          />
          <Input
            className="text-xs font-mono"
            type="password"
            placeholder="Password"
            disabled={isReadonly}
            value={auth.basic.password}
            onChange={(event) =>
              onChange({ ...auth, basic: { ...auth.basic, password: event.target.value } })
            }
          />
        </div>
      ) : null}

      {auth.type === "bearer" ? (
        <div className="space-y-1.5">
          <VariableAwareInput
            className="odl-input-1 text-xs font-mono"
            placeholder="Bearer token"
            disabled={isReadonly}
            value={auth.bearerToken}
            environmentVariableKeys={environmentVariableKeys}
            onChange={(nextValue) => onChange({ ...auth, bearerToken: nextValue })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-[var(--muted)]">
              Tip: use <code className="font-mono">{"{{VARIABLE_NAME}}"}</code> to reference an
              environment variable.
            </p>
            {environmentVariableKeys.length > 0 && !isReadonly ? (
              <select
                value=""
                onChange={(event) => {
                  const key = event.target.value;
                  if (!key) {
                    return;
                  }
                  onChange({ ...auth, bearerToken: `${auth.bearerToken}{{${key}}}` });
                }}
                className="odl-input w-auto min-w-[9rem] max-w-[14rem] text-[11px]"
              >
                <option value="">Insert variable…</option>
                {environmentVariableKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}

      {auth.type === "api-key" ? (
        <div className="grid gap-2 md:grid-cols-3">
          <VariableAwareInput
            className="odl-input-1 text-xs font-mono"
            placeholder="Key"
            disabled={isReadonly}
            value={auth.apiKey.key}
            environmentVariableKeys={environmentVariableKeys}
            onChange={(nextValue) => onChange({ ...auth, apiKey: { ...auth.apiKey, key: nextValue } })}
          />
          <VariableAwareInput
            className="odl-input-1 text-xs font-mono"
            placeholder="Value"
            disabled={isReadonly}
            value={auth.apiKey.value}
            environmentVariableKeys={environmentVariableKeys}
            onChange={(nextValue) => onChange({ ...auth, apiKey: { ...auth.apiKey, value: nextValue } })}
          />
          <select
            disabled={isReadonly}
            value={auth.apiKey.addTo}
            onChange={(event) =>
              onChange({
                ...auth,
                apiKey: { ...auth.apiKey, addTo: event.target.value as "header" | "query" },
              })
            }
            className="odl-input text-xs"
          >
            <option value="header">header</option>
            <option value="query">query</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
