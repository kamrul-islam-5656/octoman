import { NextResponse } from "next/server";
import { z } from "zod";

import { canMutate } from "@/lib/auth/rbac";
import { connectToDatabase } from "@/lib/db/connect";
import { CollectionDocumentationModel } from "@/lib/db/models/CollectionDocumentation";
import { CollectionModel } from "@/lib/db/models/Collection";
import { DocumentationFolderModel } from "@/lib/db/models/DocumentationFolder";
import { SavedRequestModel } from "@/lib/db/models/SavedRequest";
import { UserModel } from "@/lib/db/models/User";
import { generateCollectionDocumentation } from "@/lib/server/groq";
import { apiError, apiException, ApiHttpError, parseObjectId, readJsonBody } from "@/lib/server/api";
import { getTenantContext } from "@/lib/server/auth";
import { toId, toIsoDate } from "@/lib/server/serialize";

export const runtime = "nodejs";

const generateDocumentationSchema = z.object({
  description: z.string().trim().min(1).max(4000),
  format: z.enum(["markdown", "html"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function toDocumentationDto(doc: {
  _id: unknown;
  collection_id: unknown;
  format: string;
  project_description: string;
  content: string;
  generated_by: unknown;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: toId(doc._id as string),
    collection_id: toId(doc.collection_id as string),
    format: doc.format,
    project_description: doc.project_description,
    content: doc.content,
    generated_by: toId(doc.generated_by as string),
    model: doc.model,
    createdAt: toIsoDate(doc.createdAt),
    updatedAt: toIsoDate(doc.updatedAt),
  };
}

export async function GET(_request: Request, routeContext: RouteContext) {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  const { id } = await routeContext.params;
  const collectionId = parseObjectId(id);
  if (!collectionId) {
    return apiError("Invalid collection id.", 400);
  }

  try {
    await connectToDatabase();

    const documentation = await CollectionDocumentationModel.findOne({
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
      collection_id: collectionId,
    }).lean();

    return NextResponse.json({ data: documentation ? toDocumentationDto(documentation) : null });
  } catch (error) {
    return apiException(error);
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const session = await getTenantContext();
  if (!session) {
    return apiError("Unauthorized.", 401);
  }

  if (!canMutate(session.role)) {
    return apiError("Forbidden.", 403);
  }

  const { id } = await routeContext.params;
  const collectionId = parseObjectId(id);
  if (!collectionId) {
    return apiError("Invalid collection id.", 400);
  }

  try {
    const payload = await readJsonBody(request);
    const parsed = generateDocumentationSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Please provide a project description and a format.", 422);
    }

    await connectToDatabase();

    const user = await UserModel.findById(session.userId).select("ai_settings").lean();
    const aiSettings = user?.ai_settings;

    if (!aiSettings?.enabled || !aiSettings.groq_api_key) {
      throw new ApiHttpError(
        "AI assistant is not configured. Configure it in Settings.",
        422,
        "AI_NOT_CONFIGURED",
      );
    }

    const collection = await CollectionModel.findOne({
      _id: collectionId,
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
    }).lean();

    if (!collection) {
      return apiError("Collection not found.", 404);
    }

    const [folders, requests] = await Promise.all([
      DocumentationFolderModel.find({
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
        collection_id: collectionId,
      }).lean(),
      SavedRequestModel.find({
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
        collection_id: collectionId,
      }).lean(),
    ]);

    const { content, model } = await generateCollectionDocumentation({
      collection,
      folders,
      requests,
      description: parsed.data.description,
      format: parsed.data.format,
      apiKey: aiSettings.groq_api_key,
      model: aiSettings.groq_model,
    });

    const documentation = await CollectionDocumentationModel.findOneAndUpdate(
      {
        tenant_id: session.tenantId,
        workspace_id: session.workspaceId,
        collection_id: collectionId,
      },
      {
        $set: {
          format: parsed.data.format,
          project_description: parsed.data.description,
          content,
          generated_by: session.userId,
          model,
        },
      },
      { new: true, upsert: true },
    ).lean();

    return NextResponse.json({ data: toDocumentationDto(documentation) });
  } catch (error) {
    return apiException(error);
  }
}
