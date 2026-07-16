import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { apiError, apiException, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { maskGroqApiKey } from "@/lib/server/groq";
import { AiSettingsDto } from "@/types";

export const runtime = "nodejs";

const updateAiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).nullable().optional(),
});

function toAiSettingsDto(aiSettings: {
  enabled: boolean;
  groq_api_key: string | null;
  groq_model: string | null;
} | undefined | null): AiSettingsDto {
  const apiKey = aiSettings?.groq_api_key ?? null;

  return {
    enabled: aiSettings?.enabled ?? false,
    hasApiKey: Boolean(apiKey),
    maskedApiKey: apiKey ? maskGroqApiKey(apiKey) : null,
    model: aiSettings?.groq_model ?? null,
  };
}

export async function GET() {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const user = await UserModel.findById(session.userId).select("ai_settings").lean();
    if (!user) {
      return apiError("User not found.", 404);
    }

    return NextResponse.json({ data: toAiSettingsDto(user.ai_settings) });
  } catch (error) {
    return apiException(error);
  }
}

export async function PATCH(request: Request) {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = updateAiSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid AI settings payload.", 422);
    }

    await connectToDatabase();

    const update: Record<string, unknown> = {};
    if (parsed.data.enabled !== undefined) {
      update["ai_settings.enabled"] = parsed.data.enabled;
    }
    if (parsed.data.apiKey !== undefined) {
      update["ai_settings.groq_api_key"] = parsed.data.apiKey;
    }
    if (parsed.data.model !== undefined) {
      update["ai_settings.groq_model"] = parsed.data.model;
    }

    const user = await UserModel.findByIdAndUpdate(
      session.userId,
      { $set: update },
      { new: true },
    )
      .select("ai_settings")
      .lean();

    if (!user) {
      return apiError("User not found.", 404);
    }

    return NextResponse.json({ data: toAiSettingsDto(user.ai_settings) });
  } catch (error) {
    return apiException(error);
  }
}

export async function DELETE() {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const user = await UserModel.findByIdAndUpdate(
      session.userId,
      { $set: { "ai_settings.groq_api_key": null, "ai_settings.enabled": false } },
      { new: true },
    )
      .select("ai_settings")
      .lean();

    if (!user) {
      return apiError("User not found.", 404);
    }

    return NextResponse.json({ data: toAiSettingsDto(user.ai_settings) });
  } catch (error) {
    return apiException(error);
  }
}
