import mongoose, { Schema, Model } from "mongoose";

export interface IEnvironment {
  _id: string;
  tenant_id: string;
  workspace_id: string;
  collection_id: string;
  name: string;
  is_default: boolean;
  variables: { key: string; value: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const variableSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: String, default: "" },
  },
  { _id: false },
);

const EnvironmentSchema = new Schema<IEnvironment>(
  {
    tenant_id: { type: String, required: true },
    workspace_id: { type: String, required: true, index: true },
    collection_id: { type: String, required: true, index: true },
    name: { type: String, required: true },
    is_default: { type: Boolean, default: false },
    variables: { type: [variableSchema], default: [] },
  },
  { timestamps: true }
);

EnvironmentSchema.index({ tenant_id: 1, workspace_id: 1, collection_id: 1, updatedAt: -1 });

export const EnvironmentModel: Model<IEnvironment> = mongoose.models.Environment || mongoose.model<IEnvironment>("Environment", EnvironmentSchema);
