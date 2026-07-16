import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { apiError, apiException } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { DEFAULT_GROQ_MODEL, getGroqUsageSnapshot } from "@/lib/server/groq";
import { AiUsageSnapshotDto } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await connectToDatabase();

    const user = await UserModel.findById(session.userId).select("ai_settings").lean();
    const apiKey = user?.ai_settings?.groq_api_key;

    if (!apiKey) {
      return apiError("Configure your Groq API key first.", 422);
    }

    const model = user?.ai_settings?.groq_model?.trim() || DEFAULT_GROQ_MODEL;
    const snapshot = await getGroqUsageSnapshot(apiKey, model);

    const dto: AiUsageSnapshotDto = { ...snapshot, updatedAt: new Date().toISOString() };
    return NextResponse.json({ data: dto });
  } catch (error) {
    return apiException(error);
  }
}
