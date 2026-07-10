import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { canAdmin } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["Admin", "Editor", "Viewer"]),
});

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }
  if (!canAdmin(context.role)) {
    return apiError("Only Admins can view users.", 403);
  }

  try {
    await connectToDatabase();

    const users = await UserModel.find({ tenant_id: context.tenantId }).sort({ createdAt: 1 }).lean();

    return NextResponse.json({
      data: users.map((user) => ({
        id: toId(user._id),
        tenant_id: user.tenant_id,
        organization_id: user.organization_id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: toIsoDate(user.createdAt),
        updatedAt: toIsoDate(user.updatedAt),
      })),
    });
  } catch (error) {
    return apiException(error);
  }
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }
  if (!canAdmin(context.role)) {
    return apiError("Only Admins can create users.", 403);
  }

  const body = await readJsonBody(request);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request payload.", 400);
  }

  try {
    await connectToDatabase();

    const existing = await UserModel.findOne({ email: parsed.data.email }).lean();
    if (existing) {
      return apiError("A user with this email already exists.", 409);
    }

    const passwordHash = await hash(parsed.data.password, 12);

    const user = await UserModel.create({
      tenant_id: context.tenantId,
      organization_id: context.organizationId,
      name: parsed.data.name,
      email: parsed.data.email,
      password_hash: passwordHash,
      role: parsed.data.role,
    });

    return NextResponse.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    return apiException(error);
  }
}
