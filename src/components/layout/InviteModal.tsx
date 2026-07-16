"use client";

import { FormEvent, useState } from "react";
import { Check, Copy, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useApiFetch } from "@/components/providers/ApiActivityProvider";
import { WorkspaceRole } from "@/types";

interface InviteModalProps {
  workspaceId: string;
  workspaceName: string;
  workspaceRole: WorkspaceRole;
  onClose: () => void;
}

export function InviteModal({ workspaceId, workspaceName, workspaceRole, onClose }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Admin" | "Member">("Member");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const apiFetch = useApiFetch();

  const invitableRoles: ("Admin" | "Member")[] = workspaceRole === "Owner" ? ["Admin", "Member"] : ["Member"];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await apiFetch(`/api/workspaces/${workspaceId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { data?: { inviteUrl: string }; error?: string }
      | null;

    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to send invitation.");
      return;
    }

    setInviteUrl(payload?.data?.inviteUrl ?? null);
    setEmail("");
  }

  function copyInviteUrl() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Invite to workspace
          </p>
          <DialogTitle>{workspaceName}</DialogTitle>
        </DialogHeader>

        {inviteUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Invitation created. Share this link:</p>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
              <input
                readOnly
                value={inviteUrl}
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
            <Button type="button" variant="secondary" onClick={() => setInviteUrl(null)} className="w-full">
              Invite another
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--text)]" htmlFor="invite-email">
                Email address
              </label>
              <Input
                id="invite-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--text)]">Role</label>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as "Admin" | "Member")}
                className="odl-input"
              >
                {invitableRoles.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </select>
            </div>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="animate-spin" size={16} />
                  Sending...
                </span>
              ) : (
                "Send invite"
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
