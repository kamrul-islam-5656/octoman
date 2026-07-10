import mongoose, { Schema, Model } from "mongoose";

export interface IWorkspace {
  _id: string;
  tenant_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    tenant_id: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    is_default: { type: Boolean, default: false },
    created_by: { type: String, required: true },
  },
  { timestamps: true },
);

WorkspaceSchema.index({ tenant_id: 1, updatedAt: -1 });

export const WorkspaceModel: Model<IWorkspace> =
  mongoose.models.Workspace || mongoose.model<IWorkspace>("Workspace", WorkspaceSchema);
