import { redirect } from "next/navigation";

import { SetupForm } from "@/components/setup/SetupForm";
import { connectToDatabase } from "@/lib/db/connect";
import { getDatabaseErrorMessage } from "@/lib/db/errors";
import { UserModel } from "@/lib/db/models/User";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  let userCount: number;

  try {
    await connectToDatabase();
    userCount = await UserModel.countDocuments({});

    // console.log("user count:", userCount);
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <section className="odl-panel w-full max-w-2xl p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">
            Platform Bootstrap
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">
            Database Connection Required
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{databaseErrorMessage}</p>

          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text)]">
            <p className="font-semibold">Quick checks</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
              <li>Verify .env.local has a valid MONGODB_URI and MONGODB_DB_NAME.</li>
              <li>Confirm Atlas Network Access allows your current IP.</li>
              <li>Try Atlas non-SRV URI format if SRV DNS queries are blocked.</li>
              <li>Restart dev server after environment variable changes.</li>
            </ol>
          </div>
        </section>
      </main>
    );
  }

  // if (userCount > 0) {
  //   redirect("/login");
  // }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="odl-panel w-full max-w-lg p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">
          Platform Bootstrap
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">
          Initialize ODL-MAN
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create your first organization and admin account.
        </p>

        <div className="mt-6">
          <SetupForm />
        </div>
      </section>
    </main>
  );
}