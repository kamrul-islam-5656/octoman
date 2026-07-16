import Groq from "groq-sdk";

import { ApiHttpError } from "@/lib/server/api";
import { DocumentationFormat } from "@/types";

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_REQUESTS_IN_PROMPT = 60;
const MAX_BODY_SAMPLE_LENGTH = 400;

function createGroqClient(apiKey: string): Groq {
  return new Groq({ apiKey });
}

function rethrowGroqError(error: unknown): never {
  if (error instanceof Groq.APIError) {
    if (error.status === 401 || error.status === 403) {
      throw new ApiHttpError("Invalid Groq API key.", 401, "GROQ_INVALID_KEY");
    }

    throw new ApiHttpError(error.message || "The Groq API returned an error.", 502, "GROQ_REQUEST_FAILED");
  }

  throw new ApiHttpError("Failed to reach the Groq API.", 502, "GROQ_REQUEST_FAILED");
}

export function maskGroqApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }

  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

interface DocFolderLean {
  _id: unknown;
  name: string;
  parent_id?: unknown;
}

interface DocRequestLean {
  _id: unknown;
  name: string;
  description?: string;
  method: string;
  url: string;
  folder_id?: unknown;
  query_params?: { key: string; description?: string; enabled?: boolean }[];
  headers?: { key: string; enabled?: boolean }[];
  body_mode?: string;
  body_raw?: string;
  auth?: { type?: string };
}

interface DocCollectionLean {
  name: string;
  description?: string;
  auth?: { type?: string };
}

interface BuildPromptParams {
  collection: DocCollectionLean;
  folders: DocFolderLean[];
  requests: DocRequestLean[];
  description: string;
  format: DocumentationFormat;
}

function folderPath(folderId: unknown, foldersById: Map<string, DocFolderLean>): string[] {
  const segments: string[] = [];
  let currentId = folderId ? String(folderId) : null;
  let guard = 0;

  while (currentId && guard < 50) {
    const folder = foldersById.get(currentId);
    if (!folder) break;
    segments.unshift(folder.name);
    currentId = folder.parent_id ? String(folder.parent_id) : null;
    guard += 1;
  }

  return segments;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... (truncated)`;
}

export function buildDocumentationPrompt({
  collection,
  folders,
  requests,
  description,
  format,
}: BuildPromptParams): { prompt: string; truncated: boolean } {
  const foldersById = new Map<string, DocFolderLean>();
  folders.forEach((folder) => foldersById.set(String(folder._id), folder));

  const truncated = requests.length > MAX_REQUESTS_IN_PROMPT;
  const includedRequests = requests.slice(0, MAX_REQUESTS_IN_PROMPT);

  const endpointBlocks = includedRequests.map((request) => {
    const path = folderPath(request.folder_id, foldersById);
    const groupLabel = path.length > 0 ? path.join(" / ") : "(ungrouped)";

    const queryParams = (request.query_params ?? [])
      .filter((param) => param.enabled !== false && param.key.trim().length > 0)
      .map((param) => `    - ${param.key}${param.description ? `: ${param.description}` : ""}`)
      .join("\n");

    const headerKeys = (request.headers ?? [])
      .filter((header) => header.enabled !== false && header.key.trim().length > 0)
      .map((header) => header.key)
      .join(", ");

    const bodySample =
      request.body_mode === "raw" && request.body_raw
        ? `  Example body:\n\`\`\`\n${truncate(request.body_raw, MAX_BODY_SAMPLE_LENGTH)}\n\`\`\``
        : "";

    return [
      `### ${request.method} ${request.url}`,
      `Group: ${groupLabel}`,
      `Name: ${request.name}`,
      request.description ? `Description: ${request.description}` : "",
      `Auth type: ${request.auth?.type ?? "inherit"}`,
      headerKeys ? `Header names (values withheld): ${headerKeys}` : "",
      queryParams ? `Query parameters:\n${queryParams}` : "",
      bodySample,
      request.body_mode ? `Body mode: ${request.body_mode}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  const prompt = [
    `Project description provided by the author:`,
    description,
    ``,
    `Collection name: ${collection.name}`,
    collection.description ? `Collection description: ${collection.description}` : "",
    `Collection-level auth type: ${collection.auth?.type ?? "none"}`,
    ``,
    `Endpoints (${includedRequests.length}${truncated ? ` of ${requests.length}, list truncated` : ""}):`,
    ``,
    endpointBlocks.join("\n\n"),
    ``,
    `Output format: ${format === "html" ? "a single self-contained HTML document with inline CSS" : "Markdown"}.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { prompt, truncated };
}

const SYSTEM_PROMPT = `You are a professional technical writer who produces polished, developer-facing API documentation.
Given a project description and a structured list of an API collection's endpoints (grouped by folder, with method, URL,
parameter names, header names, auth type, and example request bodies), write complete, well-organized documentation.

Rules:
- Never invent secret values (tokens, keys, passwords) — only describe the auth *mechanism* the endpoint uses.
- Include: an overview, an authentication section, and a grouped endpoint reference (method, path, description, parameters,
  request body example, and expected response/error notes where inferable).
- Match the tone of professional public API docs (e.g. Stripe, Twilio).
- Output ONLY the documentation itself in the requested format — no commentary, no code fences wrapping the whole document.
- If the format is HTML, return one complete, self-contained HTML document (inline <style>, no external resources, no
  <script> tags).
- If the format is Markdown, return clean GitHub-flavored Markdown.`;

export async function generateCollectionDocumentation(
  params: BuildPromptParams & { apiKey: string; model: string | null },
): Promise<{
  content: string;
  model: string;
  truncated: boolean;
}> {
  const { prompt, truncated } = buildDocumentationPrompt(params);
  const model = params.model?.trim() || DEFAULT_GROQ_MODEL;
  const client = createGroqClient(params.apiKey);

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 8000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });
  } catch (error) {
    rethrowGroqError(error);
  }

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new ApiHttpError("The AI provider returned an empty response.", 502, "GROQ_EMPTY_RESPONSE");
  }

  return { content, model, truncated };
}

export interface GroqModelSummary {
  id: string;
}

export async function listGroqModels(apiKey: string): Promise<GroqModelSummary[]> {
  const client = createGroqClient(apiKey);

  try {
    const response = await client.models.list();
    return (response.data ?? [])
      .map((model) => ({ id: model.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    rethrowGroqError(error);
  }
}

export interface GroqUsageSnapshot {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestsLimit: string | null;
  requestsRemaining: string | null;
  requestsReset: string | null;
  tokensLimit: string | null;
  tokensRemaining: string | null;
  tokensReset: string | null;
}

export async function getGroqUsageSnapshot(apiKey: string, model: string): Promise<GroqUsageSnapshot> {
  const client = createGroqClient(apiKey);

  try {
    const { data, response } = await client.chat.completions
      .create({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "Reply with the single word: ping" }],
      })
      .withResponse();

    return {
      model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
      requestsLimit: response.headers.get("x-ratelimit-limit-requests"),
      requestsRemaining: response.headers.get("x-ratelimit-remaining-requests"),
      requestsReset: response.headers.get("x-ratelimit-reset-requests"),
      tokensLimit: response.headers.get("x-ratelimit-limit-tokens"),
      tokensRemaining: response.headers.get("x-ratelimit-remaining-tokens"),
      tokensReset: response.headers.get("x-ratelimit-reset-tokens"),
    };
  } catch (error) {
    rethrowGroqError(error);
  }
}
