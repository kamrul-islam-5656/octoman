"use client";

import { Clock, FolderKanban, Globe, Settings, ShieldUser } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type SidebarTab = "workspace" | "environments" | "history" | "settings" | "admin";

const RAIL_ITEMS: { id: SidebarTab; label: string; icon: typeof FolderKanban; adminOnly?: boolean }[] = [
  { id: "workspace", label: "Workspace", icon: FolderKanban },
  { id: "environments", label: "Environments", icon: Globe },
  { id: "history", label: "History", icon: Clock },
  { id: "settings", label: "Workspace settings", icon: Settings },
  { id: "admin", label: "Organization & users", icon: ShieldUser, adminOnly: true },
];

interface SidebarIconRailProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  showAdmin: boolean;
}

export function SidebarIconRail({ activeTab, onSelectTab, showAdmin }: SidebarIconRailProps) {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--border)] py-3">
      {RAIL_ITEMS.filter((item) => !item.adminOnly || showAdmin).map((item) => {
        const isActive = activeTab === item.id;
        const Icon = item.icon;

        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-label={item.label}
                className={cn(
                  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                  isActive &&
                    "bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)] hover:text-[var(--primary)]",
                )}
              >
                <Icon size={17} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
