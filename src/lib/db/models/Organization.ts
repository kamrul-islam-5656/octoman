import mongoose, { Schema, Model } from "mongoose";

export interface IOrganization {
  _id: string;
  tenant_id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    tenant_id: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export const OrganizationModel: Model<IOrganization> = mongoose.models.Organization || mongoose.model<IOrganization>("Organization", OrganizationSchema);
