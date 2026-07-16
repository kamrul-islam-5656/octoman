#!/usr/bin/env node
/**
 * Octoman Local Agent
 *
 * Lets the deployed Octoman web app execute requests against localhost/private
 * network backends on this machine, without needing CORS configured on those
 * backends. This process makes the real network call itself (via Node's
 * fetch), which is not subject to browser CORS rules — only the hop from the
 * browser tab to this agent needs a CORS response, which this script sends
 * for you.
 *
 * Usage:
 *   node agent/octoman-agent.mjs
 *
 * Config (env vars, all optional):
 *   OCTOMAN_AGENT_PORT             default 47893
 *   OCTOMAN_AGENT_ALLOWED_ORIGINS  comma-separated list of web app origins
 *                                  allowed to use this agent.
 *                                  default: https://octoman-lite.vercel.app,http://localhost:3000
 */

import http from "node:http";

const PORT = Number(process.env.OCTOMAN_AGENT_PORT || 47893);
const ALLOWED_ORIGINS = (
  process.env.OCTOMAN_AGENT_ALLOWED_ORIGINS || "https://octoman-lite.vercel.app,http://localhost:3000"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function setCorsHeaders(res, origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function buildBody(bodyMode, bodyRaw, bodyForm, headersRecord) {
  if (bodyMode === "raw") {
    return bodyRaw && bodyRaw.length > 0 ? bodyRaw : undefined;
  }

  if (bodyMode === "x-www-form-urlencoded") {
    const params = new URLSearchParams();
    (bodyForm || []).forEach((item) => {
      if (item.enabled === false) return;
      params.append(item.key, item.value);
    });
    if (!Object.keys(headersRecord).some((key) => key.toLowerCase() === "content-type")) {
      headersRecord["Content-Type"] = "application/x-www-form-urlencoded";
    }
    return params;
  }

  if (bodyMode === "form-data") {
    const formData = new FormData();
    (bodyForm || []).forEach((item) => {
      if (item.enabled === false) return;
      formData.append(item.key, item.value);
    });
    Object.keys(headersRecord).forEach((key) => {
      if (key.toLowerCase() === "content-type") delete headersRecord[key];
    });
    return formData;
  }

  return undefined;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    sendJson(res, 403, { error: "This origin is not allowed to use the local agent." });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, name: "octoman-agent", version: "1.0.0" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/execute") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: "Invalid JSON payload." });
      return;
    }

    const { method, url: targetUrl, headers, bodyMode, bodyRaw, bodyForm, timeoutMs } = payload;
    const headersRecord = { ...(headers || {}) };

    let bodyToSend;
    try {
      bodyToSend = buildBody(bodyMode, bodyRaw, bodyForm, headersRecord);
    } catch (bodyError) {
      sendJson(res, 400, { error: `Failed to build request body: ${bodyError.message}` });
      return;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs || 30000);

    const startedAt = Date.now();
    let status = null;
    let responseHeaders = [];
    let body = null;
    let error = null;

    try {
      const response = await fetch(targetUrl, {
        method,
        headers: headersRecord,
        body: method === "GET" || method === "HEAD" ? undefined : bodyToSend,
        signal: controller.signal,
      });

      status = response.status;
      response.headers.forEach((value, key) => {
        responseHeaders.push({ key, value });
      });
      body = await response.text();
    } catch (fetchError) {
      error =
        fetchError.name === "AbortError"
          ? "Request timed out before a response was received."
          : fetchError.message || "Request failed.";
    } finally {
      clearTimeout(timeoutHandle);
    }

    sendJson(res, 200, {
      status,
      headers: responseHeaders,
      body,
      durationMs: Date.now() - startedAt,
      error,
    });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Octoman local agent listening on http://127.0.0.1:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log("Keep this running while testing localhost/private-network requests in Octoman. Ctrl+C to stop.");
});
