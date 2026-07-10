import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Types } from "mongoose";

import { WorkspaceClient } from "@/components/dashboard/WorkspaceClient";
import { authOptions } from "@/lib/auth/options";
import { getTenantContext } from "@/lib/server/auth";
import { getWorkspaceInitialData } from "@/lib/server/workspace-initial-data";
import { UserRole } from "@/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  if (!session.user || !Types.ObjectId.isValid(session.user.id)) {
    redirect("/login");
  }

  if (!Types.ObjectId.isValid(session.user.organizationId)) {
    redirect("/login");
  }

  const tenantContext = await getTenantContext();
  if (!tenantContext) {
    redirect("/login");
  }

  const initialData = await getWorkspaceInitialData(
    {
      id: tenantContext.userId,
      role: tenantContext.role as UserRole,
      tenantId: tenantContext.tenantId,
      organizationId: tenantContext.organizationId,
      workspaceId: tenantContext.workspaceId,
    },
    { includeAdminData: tenantContext.role === "Admin" },
  );

  return <WorkspaceClient initialData={initialData} />;
}
