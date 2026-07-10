import mongoose, { Schema, Model } from "mongoose";

export interface IWorkspaceMember {
  _id: string;
  tenant_id: string;
  workspace_id: string;
  user_id: string;
  role: "Owner" | "Admin" | "Member";
  status: "Active";
  joined_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    tenant_id: { type: String, required: true, index: true },
    workspace_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    role: { type: String, enum: ["Owner", "Admin", "Member"], required: true },
    status: { type: String, enum: ["Active"], default: "Active", required: true },
    joined_at: { type: Date, required: true },
  },
  { timestamps: true },
);

WorkspaceMemberSchema.index({ workspace_id: 1, user_id: 1 }, { unique: true });
WorkspaceMemberSchema.index({ tenant_id: 1, user_id: 1, updatedAt: -1 });

export const WorkspaceMemberModel: Model<IWorkspaceMember> =
  mongoose.models.WorkspaceMember ||
  mongoose.model<IWorkspaceMember>("WorkspaceMember", WorkspaceMemberSchema);
