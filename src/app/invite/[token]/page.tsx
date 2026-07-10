import { getServerSession } from "next-auth";

import { AcceptInviteForm } from "@/components/invite/AcceptInviteForm";
import { authOptions } from "@/lib/auth/options";
import { connectToDatabase } from "@/lib/db/connect";
import { InvitationModel } from "@/lib/db/models/Invitation";
import { UserModel } from "@/lib/db/models/User";
import { WorkspaceModel } from "@/lib/db/models/Workspace";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="odl-panel w-full max-w-md p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">
          Workspace Invitation
        </p>
        {children}
      </section>
    </main>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  await connectToDatabase();

  const invitation = await InvitationModel.findOne({ token }).lean();

  if (!invitation) {
    return (
      <Shell>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">Invitation not found</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This invitation link is invalid. Ask the person who invited you to send a new one.
        </p>
      </Shell>
    );
  }

  let status = invitation.status;
  if (status === "Pending" && invitation.expires_at < new Date()) {
    await InvitationModel.updateOne({ _id: invitation._id }, { $set: { status: "Expired" } });
    status = "Expired";
  }

  if (status !== "Pending") {
    const messages: Record<string, string> = {
      Accepted: "This invitation has already been accepted.",
      Rejected: "This invitation has already been declined.",
      Expired: "This invitation has expired. Ask for a new invite link.",
    };

    return (
      <Shell>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">Invitation {status.toLowerCase()}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{messages[status]}</p>
      </Shell>
    );
  }

  const [workspace, existingUser, session] = await Promise.all([
    WorkspaceModel.findOne({ _id: invitation.workspace_id }).lean(),
    UserModel.findOne({ email: invitation.email }).select("_id email").lean(),
    getServerSession(authOptions),
  ]);

  return (
    <Shell>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">
        Join {workspace?.name ?? "a workspace"}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        You&apos;ve been invited as <span className="font-semibold">{invitation.role}</span> —{" "}
        {invitation.email}
      </p>

      <div className="mt-6">
        <AcceptInviteForm
          token={token}
          email={invitation.email}
          accountExists={Boolean(existingUser)}
          sessionEmail={session?.user?.email ?? null}
        />
      </div>
    </Shell>
  );
}
