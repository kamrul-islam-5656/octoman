import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HistoryDto } from "@/types";

interface HistoryPanelProps {
  history: HistoryDto[];
  historyScope: "mine" | "tenant";
  onSelectHistoryScope: (scope: "mine" | "tenant") => void;
  onApplyHistoryEntry: (entry: HistoryDto) => void;
}

export function HistoryPanel({
  history,
  historyScope,
  onSelectHistoryScope,
  onApplyHistoryEntry,
}: HistoryPanelProps) {
  return (
    <section>
      <p className="odl-sidebar-title">
        <History size={14} />
        History
      </p>

      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={historyScope === "mine" ? "default" : "secondary"}
          onClick={() => onSelectHistoryScope("mine")}
        >
          Mine
        </Button>
        <Button
          type="button"
          size="sm"
          variant={historyScope === "tenant" ? "default" : "secondary"}
          onClick={() => onSelectHistoryScope("tenant")}
        >
          Tenant
        </Button>
      </div>

      <div className="mt-2 space-y-2">
        {history.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onApplyHistoryEntry(entry)}
            className="odl-list-item text-left"
          >
            <span className="font-mono text-[11px] text-[var(--primary)]">{entry.method}</span>
            <span className="truncate text-xs text-[var(--muted)]">{entry.url}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
