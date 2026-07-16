import { Plus, X } from "lucide-react";

import { HttpMethod } from "@/types";

import { getMethodColor } from "./utils";

export interface RequestTabBarItem {
  tabId: string;
  requestId: string | null;
  name: string;
  method: HttpMethod;
  isDirty: boolean;
}

interface RequestTabBarProps {
  tabs: RequestTabBarItem[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export function RequestTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }: RequestTabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.tabId}
          type="button"
          onClick={() => onSelectTab(tab.tabId)}
          className={`group flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
            activeTabId === tab.tabId
              ? "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text)]"
              : "border-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)]/60"
          }`}
        >
          <span className="font-mono text-[10px] font-semibold" style={{ color: getMethodColor(tab.method) }}>
            {tab.method}
          </span>
          <span className="max-w-[10rem] truncate">{tab.name || "Untitled Request"}</span>
          {tab.isDirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" /> : null}
          <span
            role="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab(tab.tabId);
            }}
            className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--surface)] group-hover:opacity-100"
          >
            <X size={11} />
          </span>
        </button>
      ))}

      <button
        type="button"
        onClick={onNewTab}
        title="New request"
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
