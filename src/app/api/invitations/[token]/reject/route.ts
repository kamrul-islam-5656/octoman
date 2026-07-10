import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { connectToDatabase } from "@/lib/db/connect";
import { InvitationModel } from "@/lib/db/models/Invitation";
import { apiError, apiException } from "@/lib/server/api";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(_request: Request, routeContext: RouteContext) {
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

    const session = await getServerSession(authOptions);
    if (session?.user?.email && session.user.email.toLowerCase() !== invitation.email) {
      return apiError("This invitation is not addressed to your account.", 403);
    }

    invitation.status = "Rejected";
    await invitation.save();

    return NextResponse.json({ data: { rejected: true } });
  } catch (error) {
    return apiException(error);
  }
}
