import { InferSchemaType, Model, model, models, Schema } from "mongoose";

const keyValueSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    value: {
      type: String,
      default: "",
      trim: true,
      maxlength: 10000,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const authSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["inherit", "none", "basic", "bearer", "api-key"],
      default: "none",
    },
    basic: {
      username: {
        type: String,
        default: "",
        maxlength: 500,
      },
      password: {
        type: String,
        default: "",
        maxlength: 1000,
      },
    },
    bearerToken: {
      type: String,
      default: "",
      maxlength: 10000,
    },
    apiKey: {
      key: {
        type: String,
        default: "",
        maxlength: 500,
      },
      value: {
        type: String,
        default: "",
        maxlength: 10000,
      },
      addTo: {
        type: String,
        enum: ["header", "query"],
        default: "header",
      },
    },
  },
  { _id: false },
);

const savedRequestSchema = new Schema(
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
    folder_id: {
      type: Schema.Types.ObjectId,
      ref: "DocumentationFolder",
      default: null,
      index: true,
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
    method: {
      type: String,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      required: true,
      default: "GET",
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    headers: {
      type: [keyValueSchema],
      default: [],
    },
    body: {
      type: String,
      default: "",
      maxlength: 500000,
    },
    body_mode: {
      type: String,
      enum: ["none", "raw", "form-data", "x-www-form-urlencoded"],
      default: "raw",
    },
    body_raw: {
      type: String,
      default: "",
      maxlength: 500000,
    },
    body_form: {
      type: [keyValueSchema],
      default: [],
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
    request_type: {
      type: String,
      enum: ["http", "graphql", "websocket"],
      default: "http",
    },
    query_params: {
      type: [
        new Schema(
          {
            key: { type: String, default: "", maxlength: 300 },
            value: { type: String, default: "", maxlength: 10000 },
            enabled: { type: Boolean, default: true },
            description: { type: String, default: "", maxlength: 500 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    body_raw_language: {
      type: String,
      enum: ["json", "xml", "html", "text", "javascript"],
      default: "json",
    },
    pre_request_script: {
      type: String,
      default: "",
      maxlength: 100000,
    },
    test_script: {
      type: String,
      default: "",
      maxlength: 100000,
    },
    graphql_query: {
      type: String,
      default: "",
      maxlength: 200000,
    },
    graphql_variables: {
      type: String,
      default: "",
      maxlength: 100000,
    },
    examples: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, maxlength: 200 },
            status: { type: Number, default: 200 },
            headers: { type: [keyValueSchema], default: [] },
            body: { type: String, default: "", maxlength: 500000 },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
    sort_order: {
      type: Number,
      default: 0,
    },
    last_used_at: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "requests",
    timestamps: true,
  },
);

savedRequestSchema.index({ tenant_id: 1, workspace_id: 1, collection_id: 1, updatedAt: -1 });
savedRequestSchema.index({ tenant_id: 1, workspace_id: 1, folder_id: 1, updatedAt: -1 });

export type SavedRequestDocument = InferSchemaType<typeof savedRequestSchema>;

export const SavedRequestModel: Model<SavedRequestDocument> =
  (models.SavedRequest as Model<SavedRequestDocument>) ||
  model<SavedRequestDocument>("SavedRequest", savedRequestSchema);