import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "generateur_etiquettes_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET doit contenir au moins 32 caractères");
  return value;
}

export function expectedSessionToken() {
  return createHmac("sha256", secret()).update("generateur_etiquettes:authenticated:v1").digest("hex");
}

export function sessionTokenIsValid(value: string | undefined) {
  if (!value) return false;
  const expected = expectedSessionToken();
  const suppliedBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function passwordIsValid(value: string) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD n'est pas configuré");
  const suppliedBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
