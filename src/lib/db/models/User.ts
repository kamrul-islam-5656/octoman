import mongoose, { Schema, Model } from "mongoose";

export interface IUser {
  _id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "Admin" | "Editor" | "Viewer";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    tenant_id: { type: String, required: true },
    organization_id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Editor", "Viewer"], default: "Viewer" },
  },
  { timestamps: true }
);

export const UserModel: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
