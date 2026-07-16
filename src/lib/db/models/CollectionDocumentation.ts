import { InferSchemaType, Model, model, models, Schema } from "mongoose";

const collectionDocumentationSchema = new Schema(
  {
    tenant_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    workspace_id: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    collection_id: {
      type: Schema.Types.ObjectId,
      ref: "Collection",
      required: true,
      unique: true,
    },
    format: {
      type: String,
      enum: ["markdown", "html"],
      required: true,
    },
    project_description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4000,
    },
    content: {
      type: String,
      required: true,
    },
    generated_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
  },
  {
    collection: "collection_documentation",
    timestamps: true,
  },
);

export type CollectionDocumentationDocument = InferSchemaType<typeof collectionDocumentationSchema>;

export const CollectionDocumentationModel: Model<CollectionDocumentationDocument> =
  (models.CollectionDocumentation as Model<CollectionDocumentationDocument>) ||
  model<CollectionDocumentationDocument>("CollectionDocumentation", collectionDocumentationSchema);
