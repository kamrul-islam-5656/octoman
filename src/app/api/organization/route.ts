import { NextResponse } from "next/server";
import { z } from "zod";

import { canAdmin } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { OrganizationModel } from "@/lib/db/models/Organization";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(150)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens."),
});

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const organization = await OrganizationModel.findOne({ tenant_id: context.tenantId }).lean();
    if (!organization) {
      return apiError("Organization not found.", 404);
    }

    return NextResponse.json({
      data: {
        id: toId(organization._id),
        tenant_id: organization.tenant_id,
        name: organization.name,
        slug: organization.slug,
        createdAt: toIsoDate(organization.createdAt),
        updatedAt: toIsoDate(organization.updatedAt),
      },
    });
  } catch (error) {
    return apiException(error);
  }
}

export async function PATCH(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }
  if (!canAdmin(context.role)) {
    return apiError("Only Admins can update organization settings.", 403);
  }

  const body = await readJsonBody(request);
  const parsed = updateOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request payload.", 400);
  }

  try {
    await connectToDatabase();

    const slugTaken = await OrganizationModel.exists({
      slug: parsed.data.slug,
      tenant_id: { $ne: context.tenantId },
    });
    if (slugTaken) {
      return apiError("That slug is already taken.", 409);
    }

    const organization = await OrganizationModel.findOneAndUpdate(
      { tenant_id: context.tenantId },
      { $set: { name: parsed.data.name, slug: parsed.data.slug } },
      { new: true },
    ).lean();

    if (!organization) {
      return apiError("Organization not found.", 404);
    }

    return NextResponse.json({
      data: {
        id: toId(organization._id),
        tenant_id: organization.tenant_id,
        name: organization.name,
        slug: organization.slug,
        createdAt: toIsoDate(organization.createdAt),
        updatedAt: toIsoDate(organization.updatedAt),
      },
    });
  } catch (error) {
    return apiException(error);
  }
}
