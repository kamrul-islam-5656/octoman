import { Types } from "mongoose";

export function toId(value: string | Types.ObjectId | null | undefined): string {
  if (!value) {
    return "";
  }
  
  if (typeof value === "string") {
    return value;
  }
  
  return value.toString();
}

export function toIsoDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

export function sanitizeVariables(
  value: { key: string; value: string }[] | null | undefined,
): { key: string; value: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({ key: item.key, value: item.value }));
}
