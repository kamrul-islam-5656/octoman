import { useMemo } from "react";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/simple-tooltip";
import { AdminUserDto, HistoryDto } from "@/types";

interface HistoryPanelProps {
  history: HistoryDto[];
  users: AdminUserDto[];
  historyScope: "mine" | "tenant";
  onSelectHistoryScope: (scope: "mine" | "tenant") => void;
  onApplyHistoryEntry: (entry: HistoryDto) => void;
}

export function HistoryPanel({
  history,
  users,
  historyScope,
  onSelectHistoryScope,
  onApplyHistoryEntry,
}: HistoryPanelProps) {
  const usersById = useMemo(() => {
    const map = new Map<string, AdminUserDto>();
    users.forEach((user) => map.set(user.id, user));
    return map;
  }, [users]);

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
        {history.map((entry) => {
          const executedBy = usersById.get(entry.user_id);

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onApplyHistoryEntry(entry)}
              className="odl-list-item text-left"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <span className="font-mono text-[11px] text-[var(--primary)]">{entry.method}</span>
                <span className="truncate text-xs text-[var(--muted)]">{entry.url}</span>
              </span>

              <SimpleTooltip
                side="left"
                content={
                  <span className="flex flex-col">
                    <span className="font-semibold">{executedBy?.name ?? "Unknown user"}</span>
                    {executedBy?.email ? <span className="text-[var(--muted)]">{executedBy.email}</span> : null}
                  </span>
                }
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-semibold text-white">
                  {(executedBy?.name ?? "?").charAt(0).toUpperCase()}
                </span>
              </SimpleTooltip>
            </button>
          );
        })}
      </div>
    </section>
  );
}
