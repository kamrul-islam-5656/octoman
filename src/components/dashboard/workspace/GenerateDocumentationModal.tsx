"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Copy, Download, LoaderCircle, RotateCcw, Settings, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiFetch } from "@/components/providers/ApiActivityProvider";
import { Textarea } from "@/components/ui/textarea";
import { CollectionDocumentationDto, DocumentationFormat } from "@/types";

interface GenerateDocumentationModalProps {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  onOpenAiSettings: () => void;
}

export function GenerateDocumentationModal({
  collectionId,
  collectionName,
  onClose,
  onOpenAiSettings,
}: GenerateDocumentationModalProps) {
  const [view, setView] = useState<"form" | "result">("form");
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<DocumentationFormat>("markdown");
  const [content, setContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAiNotConfigured, setIsAiNotConfigured] = useState(false);
  const [copied, setCopied] = useState(false);
  const apiFetch = useApiFetch();

  useEffect(() => {
    let cancelled = false;

    async function loadExisting() {
      const response = await apiFetch(`/api/collections/${collectionId}/documentation`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { data?: CollectionDocumentationDto | null }
        | null;

      if (cancelled) return;

      if (response.ok && payload?.data) {
        setDescription(payload.data.project_description);
        setFormat(payload.data.format);
        setContent(payload.data.content);
        setView("result");
      }

      setIsLoadingExisting(false);
    }

    void loadExisting();
    return () => {
      cancelled = true;
    };
  }, [collectionId, apiFetch]);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!description.trim()) return;

    setIsGenerating(true);
    setError(null);
    setIsAiNotConfigured(false);

    const response = await apiFetch(`/api/collections/${collectionId}/documentation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description.trim(), format }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { data?: CollectionDocumentationDto; error?: string; code?: string }
      | null;

    setIsGenerating(false);

    if (!response.ok || !payload?.data) {
      if (payload?.code === "AI_NOT_CONFIGURED") {
        setIsAiNotConfigured(true);
      } else {
        setError(payload?.error ?? "Failed to generate documentation.");
      }
      return;
    }

    setContent(payload.data.content);
    setView("result");
  }

  function copyContent() {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadContent() {
    const extension = format === "html" ? "html" : "md";
    const mimeType = format === "html" ? "text/html" : "text/markdown";
    const fileName = `${collectionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-api-docs.${extension}`;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={view === "result" ? "max-w-2xl" : "max-w-md"}>
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            API documentation
          </p>
          <DialogTitle>{collectionName}</DialogTitle>
        </DialogHeader>

        {isLoadingExisting ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]">
            <LoaderCircle className="animate-spin" size={16} />
            Loading...
          </div>
        ) : isAiNotConfigured ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-sm text-[var(--text)]">
              Configure AI assistant for API documentation first.
            </p>
            <Button type="button" onClick={onOpenAiSettings} className="mx-auto">
              <Settings size={14} />
              Go to Settings
            </Button>
          </div>
        ) : view === "result" ? (
          <div className="space-y-3">
            <pre className="max-h-96 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs whitespace-pre-wrap text-[var(--text)]">
              {content}
            </pre>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={copyContent}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={downloadContent}>
                <Download size={14} />
                Download
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setView("form")}>
                <RotateCcw size={14} />
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void handleGenerate(event)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--text)]" htmlFor="doc-description">
                Project description
              </label>
              <Textarea
                id="doc-description"
                required
                autoFocus
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-28"
                placeholder="What does this API do, who is it for, and any tone/context the docs should reflect?"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--text)]">Format</label>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as DocumentationFormat)}
                className="odl-input"
              >
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
              </select>
            </div>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <Button type="submit" disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="animate-spin" size={16} />
                  Generating...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Sparkles size={16} />
                  Generate documentation
                </span>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
