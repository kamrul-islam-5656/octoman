import { NextResponse } from "next/server";
import { z } from "zod";

import { canAdmin } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const updateUserSchema = z.object({
  role: z.enum(["Admin", "Editor", "Viewer"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }
  if (!canAdmin(context.role)) {
    return apiError("Only Admins can update user roles.", 403);
  }

  const { id } = await params;
  const body = await readJsonBody(request);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request payload.", 400);
  }

  if (id === context.userId && parsed.data.role !== "Admin") {
    return apiError("You cannot remove your own Admin access.", 400);
  }

  try {
    await connectToDatabase();

    const user = await UserModel.findOneAndUpdate(
      { _id: id, tenant_id: context.tenantId },
      { $set: { role: parsed.data.role } },
      { new: true },
    ).lean();

    if (!user) {
      return apiError("User not found.", 404);
    }

    return NextResponse.json({
      data: {
        id: toId(user._id),
        tenant_id: user.tenant_id,
        organization_id: user.organization_id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: toIsoDate(user.createdAt),
        updatedAt: toIsoDate(user.updatedAt),
      },
    });
  } catch (error) {
    return apiException(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }
  if (!canAdmin(context.role)) {
    return apiError("Only Admins can delete users.", 403);
  }

  const { id } = await params;

  if (id === context.userId) {
    return apiError("You cannot delete your own account.", 400);
  }

  try {
    await connectToDatabase();

    const result = await UserModel.deleteOne({ _id: id, tenant_id: context.tenantId });
    if (result.deletedCount === 0) {
      return apiError("User not found.", 404);
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return apiException(error);
  }
}
