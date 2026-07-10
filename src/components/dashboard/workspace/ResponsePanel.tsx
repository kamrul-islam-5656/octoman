import { LoaderCircle } from "lucide-react";

import { ExecuteResultState, ResponseTabId } from "./types";
import { looksLikeJson, parseSetCookieHeader, tokenizeJsonText } from "./utils";

const JSON_TOKEN_COLORS: Record<string, string> = {
  key: "var(--code-key)",
  string: "var(--code-string)",
  number: "var(--code-number)",
  boolean: "var(--code-boolean)",
  null: "var(--code-boolean)",
};

function JsonHighlightedText({ text }: { text: string }) {
  if (!looksLikeJson(text)) {
    return <>{text}</>;
  }

  return (
    <>
      {tokenizeJsonText(text).map((token, index) =>
        token.type === "plain" ? (
          <span key={index}>{token.text}</span>
        ) : (
          <span key={index} style={{ color: JSON_TOKEN_COLORS[token.type] }}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
}

interface ResponsePanelProps {
  executeResult: ExecuteResultState | null;
  responseTab: ResponseTabId;
  setResponseTab: (tab: ResponseTabId) => void;
  responseText: string;
  responseCookieHeaders: Array<{ key: string; value: string }>;
  isExecuting: boolean;
}

export function ResponsePanel({
  executeResult,
  responseTab,
  setResponseTab,
  responseText,
  responseCookieHeaders,
  isExecuting,
}: ResponsePanelProps) {
  return (
    <section className="flex h-full flex-col overflow-hidden bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Response
        </h2>
        {isExecuting ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/15 px-2 py-1 text-xs font-semibold text-[var(--primary)]">
            <LoaderCircle size={12} className="animate-spin" />
            Sending…
          </span>
        ) : null}
        {!isExecuting && executeResult ? (
          <>
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                executeResult.ok ? "bg-green-600/15 text-green-500" : "bg-red-600/15 text-red-500"
              }`}
            >
              Status: {executeResult.status}
            </span>
            <span className="rounded-full bg-[var(--primary)]/15 px-2 py-1 text-xs font-semibold text-[var(--primary)]">
              {executeResult.durationMs} ms
            </span>
            {executeResult.errorCode ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-500">
                {executeResult.errorCode}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="odl-tabbar px-4">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setResponseTab("body")}
            className={`odl-tab ${responseTab === "body" ? "odl-tab-active" : ""}`}
          >
            Body
          </button>
          <button
            type="button"
            onClick={() => setResponseTab("headers")}
            className={`odl-tab ${responseTab === "headers" ? "odl-tab-active" : ""}`}
          >
            Headers
            {executeResult?.headers?.length ? ` (${executeResult.headers.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setResponseTab("cookies")}
            className={`odl-tab ${responseTab === "cookies" ? "odl-tab-active" : ""}`}
          >
            Cookies
            {responseCookieHeaders.length > 0 ? ` (${responseCookieHeaders.length})` : ""}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
      {isExecuting ? (
        <div className="odl-response-box flex flex-col items-center justify-center gap-2 py-16 text-[var(--muted)]">
          <LoaderCircle size={22} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm">Waiting for response…</p>
        </div>
      ) : (
        <>
          {responseTab === "body" ? (
            <pre className="odl-response-box">
              <JsonHighlightedText text={responseText} />
            </pre>
          ) : null}

          {responseTab === "headers" ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Response Headers
              </p>

              {executeResult?.headers?.length ? (
                <div className="grid gap-1">
                  {executeResult.headers.map((header, index) => (
                    <div
                      key={`${header.key}-${index}`}
                      className="grid grid-cols-[1fr_2fr] gap-2 font-mono text-xs"
                    >
                      <span className="text-[var(--primary)]">{header.key}</span>
                      <span className="truncate text-[var(--text)]">{header.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">No response headers yet.</p>
              )}
            </div>
          ) : null}

          {responseTab === "cookies" ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Response Cookies
              </p>

              {responseCookieHeaders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                        <th className="py-2 pr-3 font-semibold">Name</th>
                        <th className="py-2 pr-3 font-semibold">Value</th>
                        <th className="py-2 pr-3 font-semibold">Domain</th>
                        <th className="py-2 pr-3 font-semibold">Path</th>
                        <th className="py-2 pr-3 font-semibold">Expires</th>
                        <th className="py-2 pr-3 font-semibold">HttpOnly</th>
                        <th className="py-2 font-semibold">Secure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {responseCookieHeaders.map((header, index) => {
                        const cookie = parseSetCookieHeader(header.value);
                        return (
                          <tr
                            key={`${cookie.name}-${index}`}
                            className="border-b border-[var(--border)]/60 font-mono last:border-0"
                          >
                            <td className="py-2 pr-3 text-[var(--primary)]">{cookie.name}</td>
                            <td
                              className="max-w-[220px] truncate py-2 pr-3 text-[var(--text)]"
                              title={cookie.value}
                            >
                              {cookie.value}
                            </td>
                            <td className="py-2 pr-3 text-[var(--text)]">{cookie.domain}</td>
                            <td className="py-2 pr-3 text-[var(--text)]">{cookie.path}</td>
                            <td className="py-2 pr-3 whitespace-nowrap text-[var(--text)]">
                              {cookie.expires}
                            </td>
                            <td
                              className={`py-2 pr-3 ${
                                cookie.httpOnly ? "text-green-500" : "text-[var(--muted)]"
                              }`}
                            >
                              {String(cookie.httpOnly)}
                            </td>
                            <td
                              className={`py-2 ${
                                cookie.secure ? "text-green-500" : "text-[var(--muted)]"
                              }`}
                            >
                              {String(cookie.secure)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">No response cookies returned.</p>
              )}
            </div>
          ) : null}
        </>
      )}
      </div>
    </section>
  );
}
