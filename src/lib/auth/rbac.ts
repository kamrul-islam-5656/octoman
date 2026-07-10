import { UserRole } from "@/types";

export function canMutate(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return role === "Admin" || role === "Editor";
}

export function canAdmin(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return role === "Admin";
}

export function canRead(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return role === "Admin" || role === "Editor" || role === "Viewer";
}
