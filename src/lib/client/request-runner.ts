import { HttpMethod, KeyValuePair, RequestAuthConfig, RequestBodyMode } from "@/types";
import { interpolateHeaders, interpolateKeyValuePairs, interpolateString } from "@/lib/server/interpolate";
import { normalizeBodyForm } from "@/lib/server/request-contract";

/**
 * Detects hosts that only make sense to reach from the user's own machine
 * (localhost, loopback, and RFC1918 private ranges). Requests to these hosts
 * are executed directly in the browser (or via the local agent, if running)
 * instead of proxied through the deployed server, which cannot reach the
 * user's local network.
 */
export function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);

    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local
  }

  return false;
}

const LOCAL_AGENT_PORT = 47893;
const LOCAL_AGENT_BASE_URL = `http://127.0.0.1:${LOCAL_AGENT_PORT}`;
const LOCAL_AGENT_PING_TIMEOUT_MS = 900;

/**
 * Checks whether the Octoman local agent (agent/octoman-agent.mjs) is running
 * on this machine. When available, it's used to execute local-network
 * requests instead of the browser's own fetch, since the agent (a plain Node
 * process, not a browser page) isn't subject to CORS at all — it can reach
 * any local backend regardless of whether that backend sends CORS headers.
 */
export async function isLocalAgentAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), LOCAL_AGENT_PING_TIMEOUT_MS);
    const response = await fetch(`${LOCAL_AGENT_BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutHandle);
    return response.ok;
  } catch {
    return false;
  }
}

function toBase64(value: string): string {
  return window.btoa(unescape(encodeURIComponent(value)));
}

function normalizeHeaders(headers: KeyValuePair[]): { key: string; value: string; enabled: boolean }[] {
  return headers
    .map((header) => ({
      key: header.key.trim(),
      value: header.value,
      enabled: header.enabled ?? true,
    }))
    .filter((header) => header.key.length > 0);
}

function headersToRecord(headers: { key: string; value: string; enabled?: boolean }[]): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (header.enabled === false || !header.key.trim()) {
      return acc;
    }
    acc[header.key.trim()] = header.value;
    return acc;
  }, {});
}

function dropContentType(headersRecord: Record<string, string>): Record<string, string> {
  const nextHeaders: Record<string, string> = {};
  Object.entries(headersRecord).forEach(([key, value]) => {
    if (key.toLowerCase() === "content-type") return;
    nextHeaders[key] = value;
  });
  return nextHeaders;
}

function applyAuthToRequest(
  auth: RequestAuthConfig,
  parsedUrl: URL,
  headersRecord: Record<string, string>,
  variableMap: Record<string, string>,
): Record<string, string> {
  const nextHeaders = { ...headersRecord };

  if (auth.type === "basic") {
    const username = interpolateString(auth.basic.username, variableMap);
    const password = interpolateString(auth.basic.password, variableMap);

    if (username || password) {
      nextHeaders.Authorization = `Basic ${toBase64(`${username}:${password}`)}`;
    }
  }

  if (auth.type === "bearer") {
    const token = interpolateString(auth.bearerToken, variableMap);
    if (token) {
      nextHeaders.Authorization = `Bearer ${token}`;
    }
  }

  if (auth.type === "api-key") {
    const key = interpolateString(auth.apiKey.key, variableMap).trim();
    const value = interpolateString(auth.apiKey.value, variableMap);

    if (key) {
      if (auth.apiKey.addTo === "query") {
        parsedUrl.searchParams.set(key, value);
      } else {
        nextHeaders[key] = value;
      }
    }
  }

  return nextHeaders;
}

function toResponseHeaders(headers: Headers): { key: string; value: string }[] {
  const pairs: { key: string; value: string }[] = [];
  headers.forEach((value, key) => {
    pairs.push({ key, value });
  });
  return pairs;
}

function parseResponseBody(text: string, contentType: string): { body: unknown; errorCode: string | null } {
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return { body: JSON.parse(text), errorCode: null };
    } catch {
      return { body: text, errorCode: "EXTERNAL_RESPONSE_PARSE_ERROR" };
    }
  }

  return { body: text, errorCode: null };
}

export interface LocalExecutionParams {
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  bodyMode?: RequestBodyMode;
  bodyRaw?: string;
  bodyForm?: KeyValuePair[];
  auth: RequestAuthConfig;
  variableMap: Record<string, string>;
  timeoutMs?: number;
}

export interface LocalExecutionResult {
  finalUrl: string;
  interpolatedHeaders: KeyValuePair[];
  bodyMode: RequestBodyMode;
  persistedBodyRaw: string;
  persistedBodyForm: KeyValuePair[];
  status: number | null;
  headers: { key: string; value: string }[];
  body: unknown;
  durationMs: number;
  errorCode: string | null;
  error: string | null;
  ranViaAgent: boolean;
}

interface BuiltLocalRequest {
  finalUrl: string;
  interpolatedHeaders: KeyValuePair[];
  headersRecord: Record<string, string>;
  bodyMode: RequestBodyMode;
  bodyToSend: BodyInit | undefined;
  persistedBodyRaw: string;
  persistedBodyForm: KeyValuePair[];
  invalidJsonError: string | null;
}

function buildLocalRequest(params: LocalExecutionParams): BuiltLocalRequest {
  const normalizedHeaders = normalizeHeaders(params.headers);
  const interpolatedHeaders = interpolateHeaders(normalizedHeaders, params.variableMap);
  const interpolatedBodyForm = interpolateKeyValuePairs(normalizeBodyForm(params.bodyForm), params.variableMap);

  const interpolatedUrl = interpolateString(params.url, params.variableMap);
  const parsedUrl = new URL(interpolatedUrl);

  let headersRecord = headersToRecord(interpolatedHeaders);
  headersRecord = applyAuthToRequest(params.auth, parsedUrl, headersRecord, params.variableMap);

  const bodyMode: RequestBodyMode = params.bodyMode ?? "none";
  const rawBody = interpolateString(params.bodyRaw ?? "", params.variableMap);

  let bodyToSend: BodyInit | undefined;
  let persistedBodyRaw = "";
  let persistedBodyForm: KeyValuePair[] = [];
  let invalidJsonError: string | null = null;

  if (bodyMode === "raw") {
    persistedBodyRaw = rawBody;

    if (rawBody.trim().length > 0) {
      const contentTypeCandidate =
        Object.entries(headersRecord).find(([key]) => key.toLowerCase() === "content-type")?.[1] ??
        "application/json";

      if (contentTypeCandidate.toLowerCase().includes("application/json")) {
        try {
          bodyToSend = JSON.stringify(JSON.parse(rawBody));
        } catch {
          invalidJsonError = "JSON body is invalid.";
        }
      } else {
        bodyToSend = rawBody;
      }
    }
  }

  if (bodyMode === "x-www-form-urlencoded") {
    const formPairs = interpolatedBodyForm.filter((item) => item.enabled !== false);
    const urlParams = new URLSearchParams();
    formPairs.forEach((item) => urlParams.append(item.key, item.value));
    bodyToSend = urlParams;
    persistedBodyForm = formPairs;

    if (!Object.keys(headersRecord).some((key) => key.toLowerCase() === "content-type")) {
      headersRecord["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }

  if (bodyMode === "form-data") {
    const formPairs = interpolatedBodyForm.filter((item) => item.enabled !== false);
    const formData = new FormData();
    formPairs.forEach((item) => formData.append(item.key, item.value));
    bodyToSend = formData;
    persistedBodyForm = formPairs;
    headersRecord = dropContentType(headersRecord);
  }

  return {
    finalUrl: parsedUrl.toString(),
    interpolatedHeaders,
    headersRecord,
    bodyMode,
    bodyToSend,
    persistedBodyRaw,
    persistedBodyForm,
    invalidJsonError,
  };
}

async function runViaDirectFetch(
  built: BuiltLocalRequest,
  method: HttpMethod,
  timeoutMs: number,
): Promise<{ status: number | null; headers: { key: string; value: string }[]; body: unknown; durationMs: number; errorCode: string | null; error: string | null }> {
  const abortController = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeoutMs);

  const startedAt = Date.now();
  let status: number | null = null;
  let responseHeaders: { key: string; value: string }[] = [];
  let body: unknown = null;
  let error: string | null = null;
  let errorCode: string | null = null;

  try {
    const response = await fetch(built.finalUrl, {
      method,
      headers: built.headersRecord,
      body: built.bodyToSend,
      signal: abortController.signal,
    });

    status = response.status;
    responseHeaders = toResponseHeaders(response.headers);

    const textPayload = await response.text();
    const parsed = parseResponseBody(textPayload, response.headers.get("content-type") ?? "");
    body = parsed.body;
    errorCode = parsed.errorCode;
  } catch (caughtError) {
    if (timedOut) {
      error = "Request timed out before a response was received.";
      errorCode = "EXTERNAL_TIMEOUT";
    } else {
      console.debug("Local request execution failed:", caughtError);
      error =
        "Could not reach this address from your browser. If it's a local server, confirm it's running and " +
        "that it sends CORS headers allowing this site's origin (Access-Control-Allow-Origin), since browsers " +
        "block cross-origin requests without it — or run the Octoman local agent to bypass CORS entirely.";
      errorCode = "EXTERNAL_NETWORK_ERROR";
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  return { status, headers: responseHeaders, body, durationMs: Date.now() - startedAt, errorCode, error };
}

async function runViaLocalAgent(
  built: BuiltLocalRequest,
  method: HttpMethod,
  timeoutMs: number,
): Promise<{ status: number | null; headers: { key: string; value: string }[]; body: unknown; durationMs: number; errorCode: string | null; error: string | null } | null> {
  try {
    const response = await fetch(`${LOCAL_AGENT_BASE_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method,
        url: built.finalUrl,
        headers: built.headersRecord,
        bodyMode: built.bodyMode,
        bodyRaw: built.persistedBodyRaw,
        bodyForm: built.persistedBodyForm,
        timeoutMs,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      status: number | null;
      headers: { key: string; value: string }[];
      body: string | null;
      durationMs: number;
      error: string | null;
    };

    if (data.error) {
      return {
        status: null,
        headers: [],
        body: null,
        durationMs: data.durationMs,
        errorCode: data.error.toLowerCase().includes("timed out") ? "EXTERNAL_TIMEOUT" : "EXTERNAL_CONNECTION_REFUSED",
        error: data.error,
      };
    }

    const contentType = data.headers.find((header) => header.key.toLowerCase() === "content-type")?.value ?? "";
    const parsed = parseResponseBody(data.body ?? "", contentType);

    return {
      status: data.status,
      headers: data.headers,
      body: parsed.body,
      durationMs: data.durationMs,
      errorCode: parsed.errorCode,
      error: null,
    };
  } catch {
    return null;
  }
}

export async function executeRequestInBrowser(params: LocalExecutionParams): Promise<LocalExecutionResult> {
  const built = buildLocalRequest(params);
  const timeoutMs = params.timeoutMs ?? 30000;

  if (built.invalidJsonError) {
    return {
      finalUrl: built.finalUrl,
      interpolatedHeaders: built.interpolatedHeaders,
      bodyMode: built.bodyMode,
      persistedBodyRaw: built.persistedBodyRaw,
      persistedBodyForm: built.persistedBodyForm,
      status: null,
      headers: [],
      body: null,
      durationMs: 0,
      errorCode: "INVALID_JSON_BODY",
      error: built.invalidJsonError,
      ranViaAgent: false,
    };
  }

  const agentAvailable = await isLocalAgentAvailable();
  const outcome = agentAvailable
    ? await runViaLocalAgent(built, params.method, timeoutMs)
    : null;

  const finalOutcome = outcome ?? (await runViaDirectFetch(built, params.method, timeoutMs));

  return {
    finalUrl: built.finalUrl,
    interpolatedHeaders: built.interpolatedHeaders,
    bodyMode: built.bodyMode,
    persistedBodyRaw: built.persistedBodyRaw,
    persistedBodyForm: built.persistedBodyForm,
    status: finalOutcome.status,
    headers: finalOutcome.headers,
    body: finalOutcome.body,
    durationMs: finalOutcome.durationMs,
    errorCode: finalOutcome.errorCode,
    error: finalOutcome.error,
    ranViaAgent: outcome !== null,
  };
}
