import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { authOptions } from "@/lib/auth/options";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="odl-panel w-full max-w-md p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">
          ODL-MAN
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">
          Team API Workspace
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Secure, tenant-isolated API testing for your organization.
        </p>

        <div className="mt-6">
          <LoginForm />
        </div>

        <p className="mt-4 text-xs text-[var(--muted)]">
          First time setup? Open <span className="font-mono">/setup</span> to bootstrap the platform.
        </p>
      </section>
    </main>
  );
}