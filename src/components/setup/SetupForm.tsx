"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SetupForm() {
  const router = useRouter();

  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const setupResponse = await fetch("/api/setup/bootstrap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationName,
        fullName,
        email,
        password,
      }),
    });

    if (!setupResponse.ok) {
      const setupPayload = (await setupResponse.json().catch(() => null)) as
        | { error?: string }
        | null;

      setError(setupPayload?.error ?? "Failed to bootstrap platform.");
      setIsSubmitting(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!signInResult || signInResult.error) {
      router.push("/login");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-[var(--text)]" htmlFor="organizationName">
          Organization Name
        </label>
        <Input
          id="organizationName"
          type="text"
          value={organizationName}
          onChange={(event) => setOrganizationName(event.target.value)}
          placeholder="ODL Internal Team"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-[var(--text)]" htmlFor="fullName">
          Full Name
        </label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Platform Administrator"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-[var(--text)]" htmlFor="email">
          Admin Email
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@company.com"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-[var(--text)]" htmlFor="password">
          Admin Password
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimum 8 characters"
          required
          minLength={8}
        />
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="animate-spin" size={16} />
            Creating workspace...
          </span>
        ) : (
          "Initialize ODL-MAN"
        )}
      </Button>
    </form>
  );
}