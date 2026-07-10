import { Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useState } from "react";
import { Building2, LoaderCircle, Plus, Save, ShieldUser, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminUserDto, OrganizationDto, UserRole } from "@/types";

import { canAdmin, getErrorMessage } from "./utils";

const USER_ROLES: UserRole[] = ["Viewer", "Editor", "Admin"];

interface OrganizationPanelProps {
  organization: OrganizationDto | null;
  setOrganization: Dispatch<SetStateAction<OrganizationDto | null>>;
  users: AdminUserDto[];
  setUsers: Dispatch<SetStateAction<AdminUserDto[]>>;
  role: UserRole | undefined;
  globalError: string | null;
  setGlobalError: (message: string | null) => void;
}

export function OrganizationPanel({
  organization,
  setOrganization,
  users,
  setUsers,
  role,
  globalError,
  setGlobalError,
}: OrganizationPanelProps) {
  const [settingsTab, setSettingsTab] = useState<"organization" | "users">("organization");
  const [organizationNameDraft, setOrganizationNameDraft] = useState(organization?.name ?? "");
  const [organizationSlugDraft, setOrganizationSlugDraft] = useState(organization?.slug ?? "");

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("Viewer");

  const [isSavingOrganization, setIsSavingOrganization] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!canAdmin(role)) {
      return;
    }

    const response = await fetch("/api/users", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: AdminUserDto[]; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load users."));
      return;
    }

    setUsers(payload?.data ?? []);
    setGlobalError(null);
  }, [role, setGlobalError, setUsers]);

  const loadOrganization = useCallback(async () => {
    if (!canAdmin(role)) {
      return;
    }

    const response = await fetch("/api/organization", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: OrganizationDto; error?: string }
      | null;

    if (!response.ok) {
      setGlobalError(getErrorMessage(payload, "Failed to load organization."));
      return;
    }

    setOrganization(payload?.data ?? null);
    setOrganizationNameDraft(payload?.data?.name ?? "");
    setOrganizationSlugDraft(payload?.data?.slug ?? "");
    setGlobalError(null);
  }, [role, setGlobalError, setOrganization]);

  useEffect(() => {
    void loadOrganization();
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsCreatingUser(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setGlobalError(getErrorMessage(payload, "Failed to create user."));
        return;
      }

      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("Viewer");
      await loadUsers();
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handleUpdateUserRole(userId: string, nextRole: UserRole) {
    setUpdatingRoleUserId(userId);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setGlobalError(getErrorMessage(payload, "Failed to update user role."));
        return;
      }

      await loadUsers();
    } finally {
      setUpdatingRoleUserId(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    setDeletingUserId(userId);
    try {
      const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setGlobalError(getErrorMessage(payload, "Failed to delete user."));
        return;
      }

      await loadUsers();
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleSaveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSavingOrganization(true);
    try {
      const response = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: organizationNameDraft,
          slug: organizationSlugDraft,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setGlobalError(getErrorMessage(payload, "Failed to update organization."));
        return;
      }

      await loadOrganization();
    } finally {
      setIsSavingOrganization(false);
    }
  }

  if (!canAdmin(role)) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Admin Settings</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Organization and user management is only available for Admin accounts.
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {globalError ? (
        <div className="rounded-lg border border-red-400/30 bg-red-100/60 px-4 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
          {globalError}
        </div>
      ) : null}

      <div className="odl-tabbar">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setSettingsTab("organization")}
            className={`odl-tab ${settingsTab === "organization" ? "odl-tab-active" : ""}`}
          >
            Organization
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab("users")}
            className={`odl-tab ${settingsTab === "users" ? "odl-tab-active" : ""}`}
          >
            Users
          </button>
        </div>
      </div>

      {settingsTab === "organization" ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-4">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Building2 size={14} />
            Organization Control
          </p>

          <form onSubmit={handleSaveOrganization} className="space-y-2">
            <Input
              value={organizationNameDraft}
              onChange={(event) => setOrganizationNameDraft(event.target.value)}
              className="text-sm"
              placeholder="Organization name"
            />
            <Input
              value={organizationSlugDraft}
              onChange={(event) => setOrganizationSlugDraft(event.target.value)}
              className="text-sm font-mono"
              placeholder="organization-slug"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={isSavingOrganization}>
              {isSavingOrganization ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />}
              Save Organization
            </Button>
          </form>

          {organization ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Active organization: {organization.name} ({organization.slug})
            </p>
          ) : null}
        </section>
      ) : null}

      {settingsTab === "users" ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 p-4">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            <ShieldUser size={14} />
            User Access Control
          </p>

          <form onSubmit={handleCreateUser} className="grid gap-2 md:grid-cols-2">
            <Input
              value={newUserName}
              onChange={(event) => setNewUserName(event.target.value)}
              className="text-sm"
              placeholder="Full name"
            />
            <Input
              value={newUserEmail}
              onChange={(event) => setNewUserEmail(event.target.value)}
              className="text-sm"
              placeholder="user@company.com"
              type="email"
            />
            <Input
              value={newUserPassword}
              onChange={(event) => setNewUserPassword(event.target.value)}
              className="text-sm"
              placeholder="Password (min 8 chars)"
              type="password"
            />
            <select
              value={newUserRole}
              onChange={(event) => setNewUserRole(event.target.value as UserRole)}
              className="odl-input"
            >
              {USER_ROLES.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {roleOption}
                </option>
              ))}
            </select>

            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="md:col-span-2"
              disabled={isCreatingUser}
            >
              {isCreatingUser ? <LoaderCircle className="animate-spin" size={14} /> : <Plus size={14} />}
              Create User
            </Button>
          </form>

          <div className="mt-3 space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="grid items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{user.name}</p>
                  <p className="text-xs text-[var(--muted)]">{user.email}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {updatingRoleUserId === user.id ? (
                    <LoaderCircle className="animate-spin text-[var(--muted)]" size={12} />
                  ) : null}
                  <select
                    value={user.role}
                    disabled={updatingRoleUserId === user.id}
                    onChange={(event) => void handleUpdateUserRole(user.id, event.target.value as UserRole)}
                    className="odl-input text-xs"
                  >
                    {USER_ROLES.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>
                        {roleOption}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Delete user"
                  disabled={deletingUserId === user.id}
                  onClick={() => void handleDeleteUser(user.id)}
                >
                  {deletingUserId === user.id ? (
                    <LoaderCircle className="animate-spin" size={14} />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
