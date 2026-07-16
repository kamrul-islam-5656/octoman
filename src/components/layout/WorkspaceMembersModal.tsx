"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useApiFetch } from "@/components/providers/ApiActivityProvider";
import { InvitationDto, WorkspaceDto, WorkspaceMemberDto } from "@/types";

interface WorkspaceMembersModalProps {
  workspace: WorkspaceDto;
  onClose: () => void;
}

export function WorkspaceMembersModal({ workspace, onClose }: WorkspaceMembersModalProps) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"Admin" | "Member">("Member");
  const [isInviting, setIsInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [cancelingInvitationId, setCancelingInvitationId] = useState<string | null>(null);
  const apiFetch = useApiFetch();

  const isOwner = workspace.role === "Owner";
  const canManage = workspace.role === "Owner" || workspace.role === "Admin";
  const invitableRoles: ("Admin" | "Member")[] = isOwner ? ["Admin", "Member"] : ["Member"];

  async function loadData() {
    setIsLoading(true);
    setError(null);

    const [membersRes, invitationsRes] = await Promise.all([
      apiFetch(`/api/workspaces/${workspace.id}/members`, { cache: "no-store" }),
      apiFetch(`/api/workspaces/${workspace.id}/invitations`, { cache: "no-store" }),
    ]);

    const membersPayload = (await membersRes.json().catch(() => null)) as
      | { data?: WorkspaceMemberDto[]; error?: string }
      | null;
    const invitationsPayload = (await invitationsRes.json().catch(() => null)) as
      | { data?: InvitationDto[]; error?: string }
      | null;

    if (!membersRes.ok) {
      setError(membersPayload?.error ?? "Failed to load members.");
    } else {
      setMembers(membersPayload?.data ?? []);
    }

    if (invitationsRes.ok) {
      setInvitations(invitationsPayload?.data ?? []);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      return;
    }

    setIsInviting(true);
    setError(null);
    setLastInviteUrl(null);

    const response = await apiFetch(`/api/workspaces/${workspace.id}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { data?: InvitationDto & { inviteUrl: string }; error?: string }
      | null;

    setIsInviting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to send invitation.");
      return;
    }

    setInviteEmail("");
    setLastInviteUrl(payload?.data?.inviteUrl ?? null);
    await loadData();
  }

  async function handleCancelInvitation(id: string) {
    setCancelingInvitationId(id);
    try {
      const response = await apiFetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to cancel invitation.");
        return;
      }
      await loadData();
    } finally {
      setCancelingInvitationId(null);
    }
  }

  async function handleRoleChange(userId: string, role: "Admin" | "Member") {
    setUpdatingRoleUserId(userId);
    try {
      const response = await apiFetch(`/api/workspaces/${workspace.id}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to update role.");
        return;
      }
      await loadData();
    } finally {
      setUpdatingRoleUserId(null);
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this workspace?`)) {
      return;
    }

    setRemovingUserId(userId);
    try {
      const response = await apiFetch(`/api/workspaces/${workspace.id}/members/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to remove member.");
        return;
      }
      await loadData();
    } finally {
      setRemovingUserId(null);
    }
  }

  function copyInviteUrl() {
    if (!lastInviteUrl) return;
    void navigator.clipboard.writeText(lastInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const pendingInvitations = invitations.filter((invitation) => invitation.status === "Pending");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-auto">
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Members</p>
          <DialogTitle>{workspace.name}</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="mb-3 rounded-lg bg-red-100/60 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-[var(--muted)]">
            <LoaderCircle size={20} className="animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;
                const canEditThisMember = isOwner && member.role !== "Owner";
                const canRemoveThisMember =
                  (isOwner && !isSelf) || (workspace.role === "Admin" && member.role === "Member");

                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text)]">
                        {member.name} {isSelf ? <span className="text-[var(--muted)]">(you)</span> : null}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">{member.email}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {canEditThisMember ? (
                        <div className="flex items-center gap-1.5">
                          {updatingRoleUserId === member.userId ? (
                            <LoaderCircle className="animate-spin text-[var(--muted)]" size={12} />
                          ) : null}
                          <select
                            value={member.role}
                            disabled={updatingRoleUserId === member.userId}
                            onChange={(event) =>
                              void handleRoleChange(member.userId, event.target.value as "Admin" | "Member")
                            }
                            className="odl-input text-xs"
                          >
                            <option value="Admin">Admin</option>
                            <option value="Member">Member</option>
                          </select>
                        </div>
                      ) : (
                        <span className="rounded-full bg-[var(--surface-hover)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          {member.role}
                        </span>
                      )}

                      {canRemoveThisMember ? (
                        <button
                          type="button"
                          disabled={removingUserId === member.userId}
                          onClick={() => void handleRemove(member.userId, member.name)}
                          className="cursor-pointer text-[var(--muted)] transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {removingUserId === member.userId ? (
                            <LoaderCircle className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {pendingInvitations.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Pending invitations
                </p>
                <div className="space-y-2">
                  {pendingInvitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[var(--text)]">{invitation.email}</p>
                        <p className="text-xs text-[var(--muted)]">
                          Invited as {invitation.role} · expires{" "}
                          {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          disabled={cancelingInvitationId === invitation.id}
                          onClick={() => void handleCancelInvitation(invitation.id)}
                          className="cursor-pointer text-[var(--muted)] transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cancelingInvitationId === invitation.id ? (
                            <LoaderCircle className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {canManage ? (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Invite someone
                </p>
                <form onSubmit={(event) => void handleInvite(event)} className="space-y-3">
                  <Input
                    type="email"
                    required
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="h-9 text-sm"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as "Admin" | "Member")}
                    className="odl-input"
                  >
                    {invitableRoles.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>
                        {roleOption}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" disabled={isInviting} className="h-9 w-full text-sm">
                    {isInviting ? <LoaderCircle size={14} className="animate-spin" /> : "Invite"}
                  </Button>
                </form>

                {lastInviteUrl ? (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                    <input
                      readOnly
                      value={lastInviteUrl}
                      className="flex-1 truncate bg-transparent text-xs text-[var(--text)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyInviteUrl}
                      className="cursor-pointer text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
