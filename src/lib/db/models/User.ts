import mongoose, { Schema, Model } from "mongoose";

export interface IUserAiSettings {
  enabled: boolean;
  groq_api_key: string | null;
  groq_model: string | null;
}

export interface IUser {
  _id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "Admin" | "Editor" | "Viewer";
  ai_settings?: IUserAiSettings;
  createdAt: Date;
  updatedAt: Date;
}

const UserAiSettingsSchema = new Schema<IUserAiSettings>(
  {
    enabled: { type: Boolean, default: false },
    groq_api_key: { type: String, default: null },
    groq_model: { type: String, default: null },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    tenant_id: { type: String, required: true },
    organization_id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Editor", "Viewer"], default: "Viewer" },
    ai_settings: { type: UserAiSettingsSchema, default: () => ({ enabled: false, groq_api_key: null, groq_model: null }) },
  },
  { timestamps: true }
);

export const UserModel: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
