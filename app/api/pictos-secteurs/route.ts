import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "../../../lib-auth";

export const dynamic = "force-dynamic";

type JsonRow = Record<string, unknown>;

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Configuration Supabase incomplète : SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis",
    );
  }

  return {
    url,
    key,
    table: process.env.PICTOS_SECTEURS_TABLE || "pictos_secteurs",
    bucket: process.env.PICTOS_SECTEURS_BUCKET || "pictos_secteurs",
  };
}

function headersJson(key: string) {
  const headers: Record<string, string> = {
    apikey: key,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };

  // Compatibilite avec les anciennes cles JWT service_role et les nouvelles sb_secret_...
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

function texte(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normaliser(value: unknown): string {
  return texte(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function autorise(request: NextRequest): boolean {
  return sessionTokenIsValid(request.cookies.get(SESSION_COOKIE)?.value);
}

async function lirePictos(): Promise<JsonRow[]> {
  const { url, key, table } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(table)}`, url);
  endpoint.searchParams.set("select", "code,activite_ds,image_path,actif");
  endpoint.searchParams.set("actif", "eq.true");
  endpoint.searchParams.set("order", "code.asc");

  const response = await fetch(endpoint, {
    headers: headersJson(key),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Lecture pictos_secteurs :", details);
    throw new Error(`Supabase : ${details}`);
  }

  return (await response.json()) as JsonRow[];
}

async function chargerObjetStorage(filename: string): Promise<Response> {
  const { url, key, bucket } = config();
  const storageUrl = new URL(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`,
    url,
  );

  const response = await fetch(storageUrl, {
    headers: key.startsWith("eyJ")
      ? { apikey: key, Authorization: `Bearer ${key}` }
      : { apikey: key },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(`Picto Storage introuvable : ${filename} (${response.status})`);
    return new Response(null, { status: 404 });
  }

  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") || "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function GET(request: NextRequest) {
  if (!autorise(request)) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  try {
    const activite = request.nextUrl.searchParams.get("activite")?.trim() || "";
    const code = request.nextUrl.searchParams.get("code")?.trim() || "";
    const liste = request.nextUrl.searchParams.get("liste") === "1";

    const rows = await lirePictos();

    // Mode diagnostic : /api/pictos-secteurs?liste=1
    if (liste) {
      const pictos = rows.map((row) => ({
        code: texte(row.code),
        activite_ds: texte(row.activite_ds),
        image_path: texte(row.image_path),
      }));
      return NextResponse.json({ pictos, total: pictos.length });
    }

    if (!activite && !code) {
      return NextResponse.json(
        { error: "Parametre activite ou code manquant" },
        { status: 400 },
      );
    }

    const row = rows.find((item) => {
      if (code && normaliser(item.code) === normaliser(code)) return true;
      if (activite && normaliser(item.activite_ds) === normaliser(activite)) return true;
      return false;
    });

    if (!row) {
      return NextResponse.json(
        { error: "Aucun picto trouve pour cette activite" },
        { status: 404 },
      );
    }

    const filename = texte(row.image_path);
    if (!filename) {
      return NextResponse.json(
        { error: "Le champ image_path est vide" },
        { status: 404 },
      );
    }

    return chargerObjetStorage(filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
