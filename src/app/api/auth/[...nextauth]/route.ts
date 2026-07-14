import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/options";


//is this wokring?
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
