import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { connectToDatabase } from "@/lib/db/connect";
import { InvitationModel } from "@/lib/db/models/Invitation";
import { UserModel } from "@/lib/db/models/User";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";

export const runtime = "nodejs";

const acceptSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  password: z.string().min(8).max(128).optional(),
});

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const { token } = await routeContext.params;

  try {
    await connectToDatabase();

    const invitation = await InvitationModel.findOne({ token });
    if (!invitation) {
      return apiError("Invitation not found.", 404);
    }

    if (invitation.status === "Pending" && invitation.expires_at < new Date()) {
      invitation.status = "Expired";
      await invitation.save();
    }

    if (invitation.status !== "Pending") {
      return apiError(`This invitation is ${invitation.status.toLowerCase()}.`, 410);
    }

    const payload = await readJsonBody(request);
    const parsed = acceptSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const detail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid payload.";
      return apiError(`Invalid request payload (${detail}).`, 422);
    }

    const existingUser = await UserModel.findOne({ email: invitation.email });
    let userId: string;
    let createdAccount = false;

    if (!existingUser) {
      if (!parsed.data.name || !parsed.data.password) {
        return apiError("Name and password are required to create an account.", 422);
      }

      const passwordHash = await hash(parsed.data.password, 12);
      const createdUser = await UserModel.create({
        tenant_id: invitation.tenant_id,
        organization_id: invitation.tenant_id,
        name: parsed.data.name,
        email: invitation.email,
        password_hash: passwordHash,
        role: "Editor",
      });

      userId = createdUser._id.toString();
      createdAccount = true;
    } else {
      const session = await getServerSession(authOptions);
      if (!session?.user || session.user.email?.toLowerCase() !== invitation.email) {
        return apiError("Log in with the invited email address to accept this invitation.", 401);
      }

      userId = existingUser._id.toString();
    }

    await WorkspaceMemberModel.findOneAndUpdate(
      { workspace_id: invitation.workspace_id, user_id: userId },
      {
        $set: {
          tenant_id: invitation.tenant_id,
          role: invitation.role,
          status: "Active",
        },
        $setOnInsert: { joined_at: new Date() },
      },
      { upsert: true, new: true },
    );

    invitation.status = "Accepted";
    await invitation.save();

    return NextResponse.json({
      data: {
        accepted: true,
        createdAccount,
        email: invitation.email,
        workspaceId: invitation.workspace_id,
      },
    });
  } catch (error) {
    return apiException(error);
  }
}
