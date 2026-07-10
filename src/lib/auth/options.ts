import { compare } from "bcryptjs";
import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/lib/db/models/User";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "ODL-MAN Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        await connectToDatabase();

        const email = parsed.data.email.trim().toLowerCase();
        const user = await UserModel.findOne({ email }).lean();
        if (!user) {
          return null;
        }

        const isValidPassword = await compare(
          parsed.data.password,
          user.password_hash,
        );

        if (!isValidPassword) {
          return null;
        }

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenant_id,
          organizationId: user.organization_id.toString(),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.organizationId = user.organizationId;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "Admin" | "Editor" | "Viewer";
        session.user.tenantId = token.tenantId as string;
        session.user.organizationId = token.organizationId as string;
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};