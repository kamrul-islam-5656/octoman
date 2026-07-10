"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AcceptInviteFormProps {
  token: string;
  email: string;
  accountExists: boolean;
  sessionEmail: string | null;
}

export function AcceptInviteForm({ token, email, accountExists, sessionEmail }: AcceptInviteFormProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [declined, setDeclined] = useState(false);

  const isLoggedInAsInvitee =
    sessionEmail !== null && sessionEmail.toLowerCase() === email.toLowerCase();
  const isLoggedInAsSomeoneElse = sessionEmail !== null && !isLoggedInAsInvitee;

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`/api/invitations/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName, password }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(payload?.error ?? "Failed to accept invitation.");
      setIsSubmitting(false);
      return;
    }

    const signInResult = await signIn("credentials", { email, password, redirect: false });

    setIsSubmitting(false);

    if (signInResult?.error) {
      router.push("/login");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", { email, password, redirect: false });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Incorrect password.");
      return;
    }

    router.refresh();
  }

  async function handleAccept() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to accept invitation.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleReject() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/invitations/${token}/reject`, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to decline invitation.");
      return;
    }

    setDeclined(true);
  }

  if (declined) {
    return <p className="text-sm text-[var(--muted)]">You&apos;ve declined this invitation.</p>;
  }

  if (isLoggedInAsSomeoneElse) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--muted)]">
          You&apos;re logged in as <span className="font-semibold">{sessionEmail}</span>, but this
          invitation is for <span className="font-semibold">{email}</span>.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void signOut({ callbackUrl: `/invite/${token}` })}
          className="w-full"
        >
          Log out and try again
        </Button>
      </div>
    );
  }

  if (!accountExists && !isLoggedInAsInvitee) {
    return (
      <form onSubmit={(event) => void handleCreateAccount(event)} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--text)]" htmlFor="name">
            Your name
          </label>
          <Input
            id="name"
            required
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--text)]" htmlFor="password">
            Choose a password
          </label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimum 8 characters"
          />
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="animate-spin" size={16} />
              Creating account...
            </span>
          ) : (
            "Create account & join"
          )}
        </Button>
      </form>
    );
  }

  if (accountExists && !isLoggedInAsInvitee) {
    return (
      <form onSubmit={(event) => void handleLogin(event)} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--text)]" htmlFor="password">
            Password for {email}
          </label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="animate-spin" size={16} />
              Logging in...
            </span>
          ) : (
            "Log in to accept"
          )}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" disabled={isSubmitting} onClick={() => void handleAccept()} className="flex-1">
          Accept
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting}
          onClick={() => void handleReject()}
          className="flex-1"
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
