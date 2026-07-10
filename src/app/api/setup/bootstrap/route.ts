import { hash } from "bcryptjs";
import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { OrganizationModel } from "@/lib/db/models/Organization";
import { UserModel } from "@/lib/db/models/User";
import { WorkspaceModel } from "@/lib/db/models/Workspace";
import { WorkspaceMemberModel } from "@/lib/db/models/WorkspaceMember";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";

export const runtime = "nodejs";

const bootstrapSchema = z.object({
  organizationName: z.string().trim().min(2).max(150),
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");

  return slug || "organization";
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const parsed = bootstrapSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }

  const { organizationName, fullName, email, password } = parsed.data;

  try {
    await connectToDatabase();

    const existingUserCount = await UserModel.countDocuments({});
    if (existingUserCount > 0) {
      return apiError("Platform is already initialized. Please log in instead.", 409);
    }

    const existingUser = await UserModel.findOne({ email }).lean();
    if (existingUser) {
      return apiError("An account with this email already exists.", 409);
    }

    const organizationId = new Types.ObjectId();
    const tenantId = organizationId.toString();

    const baseSlug = slugify(organizationName);
    let slug = baseSlug;
    let suffix = 1;
    while (await OrganizationModel.exists({ slug })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const passwordHash = await hash(password, 12);

    await OrganizationModel.create({
      _id: organizationId.toString(),
      tenant_id: tenantId,
      name: organizationName,
      slug,
    });

    const adminUser = await UserModel.create({
      tenant_id: tenantId,
      organization_id: organizationId.toString(),
      name: fullName,
      email,
      password_hash: passwordHash,
      role: "Admin",
    });

    const workspace = await WorkspaceModel.create({
      tenant_id: tenantId,
      name: "Default Workspace",
      is_default: true,
      created_by: adminUser._id,
    });

    await WorkspaceMemberModel.create({
      tenant_id: tenantId,
      workspace_id: workspace._id.toString(),
      user_id: adminUser._id.toString(),
      role: "Owner",
      status: "Active",
      joined_at: new Date(),
    });

    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  } catch (error) {
    return apiException(error);
  }
}
