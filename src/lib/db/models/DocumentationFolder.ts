import { InferSchemaType, Model, model, models, Schema } from "mongoose";

const authSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["inherit", "none", "basic", "bearer", "api-key"],
      default: "inherit",
    },
    basic: {
      username: { type: String, default: "", maxlength: 500 },
      password: { type: String, default: "", maxlength: 1000 },
    },
    bearerToken: {
      type: String,
      default: "",
      maxlength: 10000,
    },
    apiKey: {
      key: { type: String, default: "", maxlength: 500 },
      value: { type: String, default: "", maxlength: 10000 },
      addTo: {
        type: String,
        enum: ["header", "query"],
        default: "header",
      },
    },
  },
  { _id: false },
);

const documentationFolderSchema = new Schema(
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
      default: null,
      index: true,
    },
    parent_id: {
      type: Schema.Types.ObjectId,
      ref: "DocumentationFolder",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    auth: {
      type: authSchema,
      default: {
        type: "inherit",
        basic: { username: "", password: "" },
        bearerToken: "",
        apiKey: { key: "", value: "", addTo: "header" },
      },
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sort_order: {
      type: Number,
      default: 0,
    },
  },
  {
    collection: "documentation_folders",
    timestamps: true,
  },
);

documentationFolderSchema.index({ tenant_id: 1, workspace_id: 1, collection_id: 1, parent_id: 1, updatedAt: -1 });

type DocumentationFolderDocument = InferSchemaType<typeof documentationFolderSchema>;

export const DocumentationFolderModel: Model<DocumentationFolderDocument> =
  (models.DocumentationFolder as Model<DocumentationFolderDocument>) ||
  model<DocumentationFolderDocument>("DocumentationFolder", documentationFolderSchema);
