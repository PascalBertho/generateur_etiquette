import { NextResponse } from "next/server";
import { expectedSessionToken, passwordIsValid, SESSION_COOKIE } from "../../../../lib-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const password = typeof payload?.password === "string" ? payload.password : "";
  if (!passwordIsValid(password)) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, expectedSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
