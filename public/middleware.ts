import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "generateur_etiquettes_session";

function getSessionSecret() {
  const value = process.env.SESSION_SECRET;

  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET doit contenir au moins 32 caractères"
    );
  }

  return value;
}

async function expectedSessionToken() {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("generateur_etiquettes:authenticated:v1")
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function sessionIsValid(request: NextRequest) {
  const supplied =
    request.cookies.get(SESSION_COOKIE)?.value || "";

  if (!supplied) {
    return false;
  }

  const expected = await expectedSessionToken();

  return safeEqual(supplied, expected);
}

function loginRedirect(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();

  loginUrl.pathname = "/login";
  loginUrl.search = "";

  const next =
    request.nextUrl.pathname +
    request.nextUrl.search;

  loginUrl.searchParams.set(
    "next",
    next === "/" ? "/generateur-etiquettes/" : next
  );

  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * L'URL racine du site doit toujours conduire vers LABEL DS.
   */
  if (pathname === "/") {
    if (!(await sessionIsValid(request))) {
      return loginRedirect(request);
    }

    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/generateur-etiquettes/";
    appUrl.search = "";

    return NextResponse.redirect(appUrl);
  }

  /*
   * La page Login et l'API Login doivent rester accessibles
   * sans être connecté.
   */
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login")
  ) {
    /*
     * Si l'utilisateur possède déjà une session valide et ouvre
     * volontairement /login, on le renvoie vers LABEL DS.
     */
    if (
      pathname === "/login" &&
      (await sessionIsValid(request))
    ) {
      const appUrl = request.nextUrl.clone();
      appUrl.pathname = "/generateur-etiquettes/";
      appUrl.search = "";

      return NextResponse.redirect(appUrl);
    }

    return NextResponse.next();
  }

  /*
   * Logout doit évidemment rester accessible afin de pouvoir
   * détruire le cookie de session.
   */
  if (
    pathname === "/logout" ||
    pathname.startsWith("/api/auth/logout")
  ) {
    return NextResponse.next();
  }

  /*
   * Protection de l'application LABEL DS et de son API articles.
   */
  if (
    pathname.startsWith("/generateur-etiquettes") ||
    pathname.startsWith("/api/articles")
  ) {
    if (!(await sessionIsValid(request))) {
      return loginRedirect(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/logout",
    "/generateur-etiquettes/:path*",
    "/api/articles/:path*",
    "/api/auth/:path*",
  ],
};
