/**
 * Bridges the Octoman page (window.postMessage) and the extension's
 * background service worker (chrome.runtime.sendMessage), which does the
 * actual CORS-free fetch.
 */

console.log("Octoman extension: content script loaded on", window.location.href);

function isFromPage(event) {
  return event.source === window && event.data && event.data.source === "octoman-page";
}

window.addEventListener("message", (event) => {
  if (!isFromPage(event)) return;

  if (event.data.type === "OCTOMAN_PING") {
    console.log("Octoman extension: received ping, replying pong");
    window.postMessage({ source: "octoman-extension", type: "OCTOMAN_PONG" }, "*");
    return;
  }

  if (event.data.type === "OCTOMAN_EXECUTE") {
    const { requestId, payload } = event.data;
    console.log("Octoman extension: executing request", payload.method, payload.url);

    const respond = (result) => {
      window.postMessage(
        {
          source: "octoman-extension",
          type: "OCTOMAN_EXECUTE_RESULT",
          requestId,
          result: result || { status: null, headers: [], body: null, durationMs: 0, error: "Extension error." },
        },
        "*",
      );
    };

    // chrome.runtime becomes invalid when the extension is reloaded/updated
    // while this content script is still injected in an existing page.
    // Calling sendMessage in that state throws synchronously, so guard it.
    if (!chrome.runtime?.id) {
      respond({ status: null, headers: [], body: null, durationMs: 0, error: "Extension was reloaded. Please refresh the page." });
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: "OCTOMAN_EXECUTE", payload }, (result) => {
        if (chrome.runtime.lastError) {
          respond({ status: null, headers: [], body: null, durationMs: 0, error: chrome.runtime.lastError.message });
          return;
        }
        respond(result);
      });
    } catch (err) {
      respond({ status: null, headers: [], body: null, durationMs: 0, error: "Extension was reloaded. Please refresh the page." });
    }
  }
});

// Announce presence proactively so the page doesn't have to wait on a ping
// round-trip on first load.
window.postMessage({ source: "octoman-extension", type: "OCTOMAN_READY" }, "*");
