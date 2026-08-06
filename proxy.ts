import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "./lib-auth";

export function proxy(request: NextRequest) {
  const authenticated = sessionTokenIsValid(request.cookies.get(SESSION_COOKIE)?.value);
  if (authenticated) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/generateur-etiquettes/:path*", "/api/articles/:path*"],
};
