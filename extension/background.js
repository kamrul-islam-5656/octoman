/**
 * Background service worker. Not a page, so it isn't subject to CORS the way
 * the Octoman tab's own JS is — with the manifest's host_permissions, fetch()
 * here can reach any http(s) host (including localhost/private IPs) freely.
 */

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

async function executeRequest(payload) {
  const { method, url, headers, bodyMode, bodyRaw, bodyForm, timeoutMs } = payload;
  const headersRecord = { ...(headers || {}) };

  let bodyToSend;
  try {
    bodyToSend = buildBody(bodyMode, bodyRaw, bodyForm, headersRecord);
  } catch (bodyError) {
    return { status: null, headers: [], body: null, durationMs: 0, error: `Failed to build request body: ${bodyError.message}` };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs || 30000);

  const startedAt = Date.now();
  let status = null;
  let responseHeaders = [];
  let body = null;
  let error = null;

  try {
    const response = await fetch(url, {
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

  return { status, headers: responseHeaders, body, durationMs: Date.now() - startedAt, error };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "OCTOMAN_EXECUTE") {
    return false;
  }

  executeRequest(message.payload).then(sendResponse);
  return true; // keep the message channel open for the async response
});
