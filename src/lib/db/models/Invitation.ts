import mongoose, { Schema, Model } from "mongoose";

export interface IInvitation {
  _id: string;
  tenant_id: string;
  workspace_id: string;
  email: string;
  role: "Admin" | "Member";
  token: string;
  status: "Pending" | "Accepted" | "Rejected" | "Expired";
  invited_by: string;
  expires_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    tenant_id: { type: String, required: true, index: true },
    workspace_id: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["Admin", "Member"], required: true },
    token: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected", "Expired"],
      default: "Pending",
      required: true,
    },
    invited_by: { type: String, required: true },
    expires_at: { type: Date, required: true },
  },
  { timestamps: true },
);

InvitationSchema.index({ workspace_id: 1, email: 1, status: 1 });

export const InvitationModel: Model<IInvitation> =
  mongoose.models.Invitation || mongoose.model<IInvitation>("Invitation", InvitationSchema);
