"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  LoaderCircle,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { signOut } from "next-auth/react";

import { useAccentColor } from "@/components/providers/AccentColorProvider";
import { useApiFetch } from "@/components/providers/ApiActivityProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { InviteModal } from "@/components/layout/InviteModal";
import { WorkspaceMembersModal } from "@/components/layout/WorkspaceMembersModal";
import { ACCENT_COLOR_PRESETS } from "@/lib/accent-colors";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Input } from "@/components/ui/input";
import { UserRole, WorkspaceDto } from "@/types";

interface TopBarProps {
  userName: string;
  role: UserRole;
  workspaces?: WorkspaceDto[];
  activeWorkspaceId?: string;
}

async function activateWorkspace(apiFetch: typeof fetch, workspaceId: string) {
  const response = await apiFetch(`/api/workspaces/${workspaceId}/activate`, { method: "POST" });
  if (response.ok) {
    window.location.href = "/";
  }
}

function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onCloseMenu,
}: {
  workspaces: WorkspaceDto[];
  activeWorkspaceId?: string;
  onCloseMenu: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [managingMembersFor, setManagingMembersFor] = useState<WorkspaceDto | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isRenamingWorkspace, setIsRenamingWorkspace] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const apiFetch = useApiFetch();

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newWorkspaceName.trim()) {
      return;
    }

    setIsCreatingWorkspace(true);
    try {
      const response = await apiFetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkspaceName.trim() }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to create workspace.");
        return;
      }

      const payload = (await response.json()) as { data: WorkspaceDto };
      await activateWorkspace(apiFetch, payload.data.id);
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  async function handleRename(event: React.FormEvent<HTMLFormElement>, workspaceId: string) {
    event.preventDefault();
    if (!renameValue.trim()) {
      return;
    }

    setIsRenamingWorkspace(true);
    try {
      const response = await apiFetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to rename workspace.");
        return;
      }

      window.location.href = "/";
    } finally {
      setIsRenamingWorkspace(false);
    }
  }

  async function handleDelete(workspaceId: string, name: string) {
    if (!window.confirm(`Delete workspace "${name}"? This permanently deletes everything in it.`)) {
      return;
    }

    setDeletingWorkspaceId(workspaceId);
    try {
      const response = await apiFetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to delete workspace.");
        return;
      }

      window.location.href = "/";
    } finally {
      setDeletingWorkspaceId(null);
    }
  }

  if (!activeWorkspace) {
    return null;
  }

  return (
    <>
      <NavigationMenuItem value="workspace">
        <NavigationMenuTrigger className="hidden sm:inline-flex">
          <span className="text-sm font-medium text-[var(--text)]">{activeWorkspace.name}</span>
        </NavigationMenuTrigger>
        <NavigationMenuContent className="right-0 left-auto w-72">
          {error ? (
            <p className="mb-2 rounded-md bg-red-100/60 px-2 py-1 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <div className="max-h-64 overflow-auto">
            {workspaces.map((workspace) => {
              const canManage = workspace.role === "Owner" || workspace.role === "Admin";

              return (
                <div key={workspace.id} className="mb-1 rounded-md px-2 py-1.5 hover:bg-[var(--surface-hover)]">
                  {renamingId === workspace.id ? (
                    <form
                      onSubmit={(event) => void handleRename(event, workspace.id)}
                      className="flex items-center gap-1"
                    >
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className="h-8 flex-1 text-xs"
                        disabled={isRenamingWorkspace}
                      />
                      <Button type="submit" size="sm" className="h-8 text-xs" disabled={isRenamingWorkspace}>
                        {isRenamingWorkspace ? <LoaderCircle className="animate-spin" size={12} /> : null}
                        Save
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void activateWorkspace(apiFetch, workspace.id)}
                        className={`flex-1 truncate text-left text-sm ${
                          workspace.id === activeWorkspace.id
                            ? "font-semibold text-[var(--primary)]"
                            : "text-[var(--text)]"
                        }`}
                      >
                        {workspace.name}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          {workspace.role}
                        </span>
                      </button>

                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            onCloseMenu();
                            setManagingMembersFor(workspace);
                          }}
                        >
                          <Users size={13} />
                        </Button>
                      ) : null}

                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setRenamingId(workspace.id);
                            setRenameValue(workspace.name);
                          }}
                        >
                          <Pencil size={13} />
                        </Button>
                      ) : null}

                      {workspace.role === "Owner" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-red-500"
                          disabled={deletingWorkspaceId === workspace.id}
                          onClick={() => void handleDelete(workspace.id, workspace.name)}
                        >
                          {deletingWorkspaceId === workspace.id ? (
                            <LoaderCircle className="animate-spin" size={13} />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-1 border-t border-[var(--border)] pt-2">
            {isCreating ? (
              <form onSubmit={(event) => void handleCreate(event)} className="flex items-center gap-1">
                <Input
                  autoFocus
                  placeholder="Workspace name"
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  className="h-8 flex-1 text-xs"
                  disabled={isCreatingWorkspace}
                />
                <Button type="submit" size="sm" className="h-8 text-xs" disabled={isCreatingWorkspace}>
                  {isCreatingWorkspace ? <LoaderCircle className="animate-spin" size={12} /> : null}
                  Create
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreating(true)}
                className="w-full justify-start text-[var(--muted)] hover:text-[var(--text)]"
              >
                <Plus size={14} />
                New workspace
              </Button>
            )}
          </div>
        </NavigationMenuContent>
      </NavigationMenuItem>

      {managingMembersFor ? (
        <WorkspaceMembersModal
          workspace={managingMembersFor}
          onClose={() => setManagingMembersFor(null)}
        />
      ) : null}
    </>
  );
}

function AccountMenu({
  userName,
  role,
  theme,
  toggleTheme,
  accentColor,
  setAccentColor,
  isOpen,
  onOpenChange,
}: {
  userName: string;
  role: UserRole;
  theme: string;
  toggleTheme: () => void;
  accentColor: string;
  setAccentColor: (id: string) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-state={isOpen ? "open" : "closed"}
        onClick={() => onOpenChange(!isOpen)}
        className="group inline-flex h-9 w-max cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pr-3 pl-1.5 text-sm font-medium text-[var(--text)] outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] data-[state=open]:bg-[var(--surface-hover)]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
          {userName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{userName}</span>
        <ChevronDown
          size={14}
          className={`text-[var(--muted)] transition duration-200 ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div className="absolute top-full right-0 left-auto z-40 mt-1.5 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text)] shadow-lg">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-[var(--text)]">{userName}</p>
            <p className="text-xs font-normal text-[var(--muted)]">{role}</p>
          </div>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </button>
          <div className="my-1 h-px bg-[var(--border)]" />
          <div className="px-2 py-1.5">
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">Accent color</p>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.label}
                  onClick={() => setAccentColor(preset.id)}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: preset.light.primary,
                    boxShadow:
                      accentColor === preset.id
                        ? `0 0 0 2px var(--surface), 0 0 0 4px ${preset.light.primary}`
                        : undefined,
                  }}
                >
                  {accentColor === preset.id ? <Check size={12} className="text-white" /> : null}
                  <span className="sr-only">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/10"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({
  userName,
  role,
  workspaces,
  activeWorkspaceId,
}: TopBarProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [openMenu, setOpenMenu] = useState("");
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { accentColor, setAccentColor } = useAccentColor();

  const activeWorkspace = workspaces?.find((workspace) => workspace.id === activeWorkspaceId);
  const canInvite = activeWorkspace?.role === "Owner" || activeWorkspace?.role === "Admin";

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 md:px-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]">
            {logoFailed ? (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[var(--primary)]">
                ODL
              </span>
            ) : (
              <Image
                src="/logo.png"
                alt="ODL-MAN logo"
                fill
                priority
                sizes="32px"
                unoptimized
                className="object-contain p-0.5"
                onError={() => setLogoFailed(true)}
              />
            )}
          </div>
          <p className="text-sm font-semibold tracking-wide text-[var(--text)]">ODL-MAN</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {canInvite ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsInviting(true)}
            className="hidden sm:flex"
          >
            <UserPlus size={14} className="text-[var(--muted)]" />
            Invite
          </Button>
        ) : null}

        <NavigationMenu
          viewport={false}
          value={openMenu}
          onValueChange={(value) => {
            setOpenMenu(value);
            if (value) {
              setIsAccountOpen(false);
            }
          }}
        >
          <NavigationMenuList>
            {workspaces && workspaces.length > 0 ? (
              <WorkspaceSwitcher
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                onCloseMenu={() => setOpenMenu("")}
              />
            ) : null}
          </NavigationMenuList>
        </NavigationMenu>

        <AccountMenu
          userName={userName}
          role={role}
          theme={theme}
          toggleTheme={toggleTheme}
          accentColor={accentColor}
          setAccentColor={setAccentColor}
          isOpen={isAccountOpen}
          onOpenChange={(open) => {
            setIsAccountOpen(open);
            if (open) {
              setOpenMenu("");
            }
          }}
        />
      </div>

      {isInviting && activeWorkspace ? (
        <InviteModal
          workspaceId={activeWorkspace.id}
          workspaceName={activeWorkspace.name}
          workspaceRole={activeWorkspace.role}
          onClose={() => setIsInviting(false)}
        />
      ) : null}
    </header>
  );
}
