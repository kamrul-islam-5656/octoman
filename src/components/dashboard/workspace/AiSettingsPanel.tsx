"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Info,
  Key,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiFetch } from "@/components/providers/ApiActivityProvider";
import { AiModelDto, AiSettingsDto, AiUsageSnapshotDto } from "@/types";

const FALLBACK_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
];

const HELP_STEPS = [
  <>
    Open <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline">Groq Console</a> and sign in.
  </>,
  <>
    Go to <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="underline">API Keys</a> and create a new key.
  </>,
  "Paste the key in the Groq API Key field.",
  "Click Fetch from Groq to verify the key and load available models.",
  "Turn on Enable AI and click Save Settings.",
];

export function AiSettingsPanel() {
  const apiFetch = useApiFetch();

  const [isLoading, setIsLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(null);
  const [model, setModel] = useState<string>(FALLBACK_MODELS[0]);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const [modelOptions, setModelOptions] = useState<AiModelDto[] | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const [usage, setUsage] = useState<AiUsageSnapshotDto | null>(null);
  const [isFetchingUsage, setIsFetchingUsage] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const response = await apiFetch("/api/settings/ai", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { data?: AiSettingsDto } | null;

      if (cancelled || !response.ok || !payload?.data) {
        setIsLoading(false);
        return;
      }

      setEnabled(payload.data.enabled);
      setHasApiKey(payload.data.hasApiKey);
      setMaskedApiKey(payload.data.maskedApiKey);
      setModel(payload.data.model ?? FALLBACK_MODELS[0]);
      setIsLoading(false);
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  async function handleFetchModels() {
    setError(null);
    setIsFetchingModels(true);
    try {
      const response = await apiFetch("/api/settings/ai/models", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { data?: AiModelDto[]; error?: string }
        | null;

      if (!response.ok || !payload?.data) {
        setError(payload?.error ?? "Failed to fetch models from Groq.");
        return;
      }

      setModelOptions(payload.data);
      if (payload.data.length > 0 && !payload.data.some((item) => item.id === model)) {
        setModel(payload.data[0].id);
      }
    } finally {
      setIsFetchingModels(false);
    }
  }

  async function handleRefreshUsage() {
    setError(null);
    setIsFetchingUsage(true);
    try {
      const response = await apiFetch("/api/settings/ai/usage", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { data?: AiUsageSnapshotDto; error?: string }
        | null;

      if (!response.ok || !payload?.data) {
        setError(payload?.error ?? "Failed to fetch usage from Groq.");
        return;
      }

      setUsage(payload.data);
    } finally {
      setIsFetchingUsage(false);
    }
  }

  async function handleDeleteKey() {
    setError(null);
    setIsSaving(true);
    try {
      const response = await apiFetch("/api/settings/ai", { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { data?: AiSettingsDto; error?: string } | null;

      if (!response.ok || !payload?.data) {
        setError(payload?.error ?? "Failed to delete the API key.");
        return;
      }

      setEnabled(payload.data.enabled);
      setHasApiKey(payload.data.hasApiKey);
      setMaskedApiKey(payload.data.maskedApiKey);
      setModelOptions(null);
      setUsage(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const body: { enabled: boolean; model: string; apiKey?: string } = {
        enabled,
        model,
      };

      if (isEditingKey && apiKeyInput.trim()) {
        body.apiKey = apiKeyInput.trim();
      }

      const response = await apiFetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as { data?: AiSettingsDto; error?: string } | null;

      if (!response.ok || !payload?.data) {
        setError(payload?.error ?? "Failed to save AI settings.");
        return;
      }

      setEnabled(payload.data.enabled);
      setHasApiKey(payload.data.hasApiKey);
      setMaskedApiKey(payload.data.maskedApiKey);
      setModel(payload.data.model ?? model);
      setIsEditingKey(false);
      setApiKeyInput("");
      setSuccessMessage("Settings saved.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--muted)]">
        <LoaderCircle className="animate-spin" size={20} />
      </div>
    );
  }

  const combinedModelIds = new Set([...FALLBACK_MODELS, ...(modelOptions?.map((item) => item.id) ?? []), model]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Configure AI assistant for API documentation.</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-[var(--primary)]">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">AI Writing Assistant (Groq)</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Enables AI-generated API documentation for your collections.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowHelp((previous) => !previous)}>
            <Info size={14} />
            {showHelp ? "Hide Help" : "AI Help"}
          </Button>
        </div>

        {showHelp ? (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--primary)_8%,transparent)] p-3 text-sm text-[var(--text)]">
            <p className="mb-2 font-semibold">How to enable AI</p>
            <ol className="list-inside list-decimal space-y-1 text-[var(--muted)]">
              {HELP_STEPS.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="my-4 h-px bg-[var(--border)]" />

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Enable AI</p>
            <p className="text-xs text-[var(--muted)]">When disabled, AI docs generation is hidden.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((previous) => !previous)}
            className={`inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 p-0.5 outline-none transition-colors ${
              enabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="my-4 h-px bg-[var(--border)]" />

        <div>
          <p className="mb-1.5 text-sm font-medium text-[var(--text)]">Groq API Key</p>
          {isEditingKey ? (
            <div className="flex items-center gap-2">
              <Input
                type="password"
                autoFocus
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                placeholder="gsk_..."
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsEditingKey(false);
                  setApiKeyInput("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <Key size={14} className="shrink-0 text-[var(--muted)]" />
              <span className="flex-1 truncate font-mono text-sm text-[var(--text)]">
                {maskedApiKey ?? "Not configured"}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingKey(true)}>
                <Pencil size={12} />
                Edit
              </Button>
              {hasApiKey ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-500 hover:text-red-500"
                  onClick={() => void handleDeleteKey()}
                  disabled={isSaving}
                >
                  <Trash2 size={12} />
                  Delete
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--text)]">Model</p>
            <button
              type="button"
              onClick={() => void handleFetchModels()}
              disabled={isFetchingModels}
              className="flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={12} className={isFetchingModels ? "animate-spin" : ""} />
              Fetch from Groq
            </button>
          </div>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="odl-input text-sm"
          >
            {Array.from(combinedModelIds).map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--border)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Groq Usage Snapshot</p>
              <p className="text-xs text-[var(--muted)]">Live usage and rate limit data from Groq API.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleRefreshUsage()} disabled={isFetchingUsage}>
              <RefreshCw size={12} className={isFetchingUsage ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>

          {usage ? (
            <div className="mt-3 space-y-2 text-xs">
              <p className="text-[var(--muted)]">
                Model: <span className="font-medium text-[var(--text)]">{usage.model}</span>
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-[var(--surface-hover)] p-2">
                  <p className="text-[var(--muted)]">Prompt Tokens</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{usage.promptTokens}</p>
                </div>
                <div className="rounded-md bg-[var(--surface-hover)] p-2">
                  <p className="text-[var(--muted)]">Completion Tokens</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{usage.completionTokens}</p>
                </div>
                <div className="rounded-md bg-[var(--surface-hover)] p-2">
                  <p className="text-[var(--muted)]">Total Tokens</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{usage.totalTokens}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-[var(--border)] p-2">
                  <p className="text-[var(--muted)]">Requests Left</p>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {usage.requestsRemaining ?? "—"} / {usage.requestsLimit ?? "—"}
                  </p>
                  {usage.requestsReset ? (
                    <p className="text-[var(--muted)]">Reset: {usage.requestsReset}</p>
                  ) : null}
                </div>
                <div className="rounded-md border border-[var(--border)] p-2">
                  <p className="text-[var(--muted)]">Tokens Left</p>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {usage.tokensRemaining ?? "—"} / {usage.tokensLimit ?? "—"}
                  </p>
                  {usage.tokensReset ? <p className="text-[var(--muted)]">Reset: {usage.tokensReset}</p> : null}
                </div>
              </div>

              <p className="text-[var(--muted)]">Updated: {new Date(usage.updatedAt).toLocaleString()}</p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--muted)]">Click Refresh to fetch a live usage snapshot.</p>
          )}
        </div>

        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        {successMessage ? <p className="mt-3 text-sm text-green-600">{successMessage}</p> : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          {hasApiKey ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 size={14} />
              API key configured
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <XCircle size={14} />
              Not configured
            </span>
          )}

          <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? <LoaderCircle className="animate-spin" size={14} /> : null}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
