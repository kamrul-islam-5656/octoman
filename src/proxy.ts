import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const publicPages = new Set(["/login", "/setup"]);
const publicPagePrefixes = ["/invite/"];
const publicApiPrefixes = ["/api/auth", "/api/setup/bootstrap", "/api/invitations"];

function isPublicApi(pathname: string): boolean {
  return publicApiPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function isPublicPage(pathname: string): boolean {
  return publicPages.has(pathname) || publicPagePrefixes.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png"
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (pathname.startsWith("/api")) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }

    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    return NextResponse.next();
  }

  if (token && publicPages.has(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!token && !isPublicPage(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};