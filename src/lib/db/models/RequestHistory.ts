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

const requestHistorySchema = new Schema(
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
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
    request_id: {
      type: Schema.Types.ObjectId,
      ref: "SavedRequest",
      default: null,
      index: true,
    },
    method: {
      type: String,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      required: true,
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
    environment_name: {
      type: String,
      default: null,
      maxlength: 160,
    },
    response_status: {
      type: Number,
      default: null,
    },
    response_headers: {
      type: [keyValueSchema],
      default: [],
    },
    response_body: {
      type: Schema.Types.Mixed,
      default: null,
    },
    duration_ms: {
      type: Number,
      required: true,
      default: 0,
    },
    error_code: {
      type: String,
      default: null,
      maxlength: 80,
    },
    error: {
      type: String,
      default: null,
      maxlength: 5000,
    },
    test_results: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, maxlength: 500 },
            passed: { type: Boolean, required: true },
            error: { type: String, default: null, maxlength: 5000 },
            durationMs: { type: Number, default: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    timing: {
      type: new Schema(
        {
          dns: { type: Number, default: 0 },
          tcp: { type: Number, default: 0 },
          tls: { type: Number, default: 0 },
          ttfb: { type: Number, default: 0 },
          download: { type: Number, default: 0 },
          total: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  {
    collection: "request_history",
    timestamps: true,
  },
);

requestHistorySchema.index({ tenant_id: 1, workspace_id: 1, createdAt: -1 });
requestHistorySchema.index({ tenant_id: 1, workspace_id: 1, user_id: 1, createdAt: -1 });
requestHistorySchema.index({ tenant_id: 1, workspace_id: 1, collection_id: 1, createdAt: -1 });
requestHistorySchema.index({ tenant_id: 1, workspace_id: 1, folder_id: 1, createdAt: -1 });

export type RequestHistoryDocument = InferSchemaType<typeof requestHistorySchema>;

export const RequestHistoryModel: Model<RequestHistoryDocument> =
  (models.RequestHistory as Model<RequestHistoryDocument>) ||
  model<RequestHistoryDocument>("RequestHistory", requestHistorySchema);