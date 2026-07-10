import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

type AppUserRole = "Admin" | "Editor" | "Viewer";

declare module "next-auth" {
  interface User extends DefaultUser {
    id: string;
    role: AppUserRole;
    tenantId: string;
    organizationId: string;
  }

  interface Session {
    user: {
      id: string;
      role: AppUserRole;
      tenantId: string;
      organizationId: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: AppUserRole;
    tenantId: string;
    organizationId: string;
  }
}
