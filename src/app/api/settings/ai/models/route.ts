import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";
import { apiError, apiException } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { listGroqModels } from "@/lib/server/groq";

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

    const models = await listGroqModels(apiKey);
    return NextResponse.json({ data: models });
  } catch (error) {
    return apiException(error);
  }
}
