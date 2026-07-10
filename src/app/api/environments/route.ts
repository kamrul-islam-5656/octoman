import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { EnvironmentModel } from "@/lib/db/models/Environment";
import { apiError } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { sanitizeVariables, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const environmentVariableSchema = z.object({
  key: z.string().trim().min(1).max(150),
  value: z.string().max(20000),
});

const createEnvironmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  is_default: z.boolean().optional().default(false),
  variables: z.array(environmentVariableSchema).default([]),
});

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  await connectToDatabase();

  const environments = await EnvironmentModel.find({
    tenant_id: context.tenantId,
    workspace_id: context.workspaceId,
  })
    .sort({ is_default: -1, updatedAt: -1 })
    .lean();

  return NextResponse.json({
    data: environments.map((env) => ({
      id: env._id.toString(),
      tenant_id: env.tenant_id,
      workspace_id: env.workspace_id.toString(),
      name: env.name,
      is_default: env.is_default,
      variables: sanitizeVariables(env.variables),
      createdAt: toIsoDate(env.createdAt),
      updatedAt: toIsoDate(env.updatedAt),
    })),
  });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return apiError("Unauthorized.", 401);
  }

  if (!canMutate(context.role)) {
    return apiError("Forbidden.", 403);
  }

  const payload = await request.json().catch(() => null);
  const parsed = createEnvironmentSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError("Invalid environment payload.", 422);
  }

  await connectToDatabase();

  if (parsed.data.is_default) {
    await EnvironmentModel.updateMany(
      { tenant_id: context.tenantId, workspace_id: context.workspaceId, is_default: true },
      { $set: { is_default: false } },
    );
  }

  const created = await EnvironmentModel.create({
    tenant_id: context.tenantId,
    workspace_id: context.workspaceId,
    name: parsed.data.name,
    is_default: parsed.data.is_default,
    variables: parsed.data.variables,
  });

  return NextResponse.json(
    {
      data: {
        id: created._id.toString(),
        tenant_id: created.tenant_id,
        workspace_id: created.workspace_id.toString(),
        name: created.name,
        is_default: created.is_default,
        variables: sanitizeVariables(created.variables),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
