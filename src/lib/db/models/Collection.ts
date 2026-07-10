import { InferSchemaType, Model, model, models, Schema } from "mongoose";

const authSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["none", "basic", "bearer", "api-key"],
      default: "none",
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

const collectionSchema = new Schema(
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
    environment_id: {
      type: Schema.Types.ObjectId,
      ref: "Environment",
      default: null,
      index: true,
    },
    auth: {
      type: authSchema,
      default: {
        type: "none",
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
    published: {
      type: Boolean,
      default: false,
    },
    publish_slug: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
  },
  {
    collection: "collections",
    timestamps: true,
  },
);

collectionSchema.index({ tenant_id: 1, workspace_id: 1, updatedAt: -1 });

export type CollectionDocument = InferSchemaType<typeof collectionSchema>;

export const CollectionModel: Model<CollectionDocument> =
  (models.Collection as Model<CollectionDocument>) ||
  model<CollectionDocument>("Collection", collectionSchema);