import mongoose, { Schema, Model } from "mongoose";

export interface IRunResult {
  _id: string;
  tenant_id: string;
  collection_id: string;
  environment_id: string | null;
  total: number;
  passed: number;
  failed: number;
  iterations: number;
  delay_ms: number;
  status: "running" | "completed" | "stopped";
  results: Array<{
    iteration: number;
    request_id: string;
    request_name: string;
    method: string;
    url: string;
    status: number | null;
    duration_ms: number;
    passed: boolean;
    error?: string;
  }>;
  started_at: Date;
  completed_at: Date | null;
  createdAt: Date;
}

const RunResultSchema = new Schema<IRunResult>(
  {
    tenant_id: { type: String, required: true },
    collection_id: { type: String, required: true },
    environment_id: { type: String, default: null },
    total: { type: Number, required: true },
    passed: { type: Number, required: true },
    failed: { type: Number, required: true },
    iterations: { type: Number, required: true },
    delay_ms: { type: Number, required: true },
    status: { type: String, enum: ["running", "completed", "stopped"], required: true },
    results: [{
      iteration: Number,
      request_id: String,
      request_name: String,
      method: String,
      url: String,
      status: { type: Number, default: null },
      duration_ms: Number,
      passed: Boolean,
      error: String,
    }],
    started_at: { type: Date, required: true },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

export const RunResultModel: Model<IRunResult> = mongoose.models.RunResult || mongoose.model<IRunResult>("RunResult", RunResultSchema);
