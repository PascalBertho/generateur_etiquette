import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "../../../../lib-auth";

export const dynamic = "force-dynamic";

type JsonRow = Record<string, unknown>;

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configuration Supabase incomplète : SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis");
  }
  return {
    url,
    key,
    articlesTable: process.env.ARTICLES_TABLE || "articles",
    bucket: process.env.PHOTOS_BUCKET || "articles_photo",
  };
}

function headersJson(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

function texte(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function nomFichierPourRef(ref: string): string {
  const propre = ref.trim().replace(/[\\/]/g, "_");
  if (!propre) throw new Error("Référence article vide");
  return `${propre}.png`;
}

async function lireArticles(q: string): Promise<JsonRow[]> {
  const { url, key, articlesTable } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(articlesTable)}`, url);
  endpoint.searchParams.set("select", "articles_numero,articles_nomfr,articles_famille,photo");
  endpoint.searchParams.set("articles_numero", "not.is.null");
  endpoint.searchParams.set("order", "articles_numero.asc");
  endpoint.searchParams.set("limit", "10000");
  if (q) {
    const safe = q.replace(/[,*()]/g, " ").trim();
    if (safe) endpoint.searchParams.set("or", `(articles_numero.ilike.*${safe}*,articles_nomfr.ilike.*${safe}*)`);
  }

  const response = await fetch(endpoint, { headers: headersJson(key), cache: "no-store" });
  if (!response.ok) {
    const details = await response.text();
    console.error("Lecture articles photos:", details);
    throw new Error("Impossible de charger la liste des articles");
  }
  return (await response.json()) as JsonRow[];
}

async function lirePhotoArticle(ref: string): Promise<string> {
  const { url, key, articlesTable } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(articlesTable)}`, url);
  endpoint.searchParams.set("select", "photo");
  endpoint.searchParams.set("articles_numero", `eq.${ref}`);
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, { headers: headersJson(key), cache: "no-store" });
  if (!response.ok) throw new Error("Article introuvable");
  const rows = (await response.json()) as JsonRow[];
  return texte(rows[0]?.photo);
}

async function chargerObjetStorage(filename: string): Promise<Response> {
  const { url, key, bucket } = config();
  const storageUrl = new URL(`/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`, url);
  const response = await fetch(storageUrl, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!response.ok) return new Response(null, { status: 404 });
  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") || "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}

async function uploaderPng(filename: string, bytes: ArrayBuffer): Promise<void> {
  const { url, key, bucket } = config();
  const endpoint = new URL(`/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`, url);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "image/png",
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: bytes,
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Upload Storage ${filename}:`, details);
    throw new Error(`Impossible d'enregistrer ${filename} dans le bucket`);
  }
}

async function mettreAJourPhotoArticle(ref: string, filename: string): Promise<void> {
  const { url, key, articlesTable } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(articlesTable)}`, url);
  endpoint.searchParams.set("articles_numero", `eq.${ref}`);
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { ...headersJson(key), Prefer: "return=minimal" },
    body: JSON.stringify({ photo: filename }),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Mise à jour photo article ${ref}:`, details);
    throw new Error(`Impossible de mettre à jour l'article ${ref}`);
  }
}

function autorise(request: NextRequest): boolean {
  return sessionTokenIsValid(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  if (!autorise(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const ref = request.nextUrl.searchParams.get("ref")?.trim() || "";
    if (ref) {
      const filename = await lirePhotoArticle(ref);
      if (!filename) return new Response(null, { status: 404 });
      return chargerObjetStorage(filename);
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const rows = await lireArticles(q);
    const articles = rows
      .map((row) => ({
        numero: texte(row.articles_numero).replace(/\.0$/, ""),
        libelle: texte(row.articles_nomfr),
        famille: texte(row.articles_famille),
        photo: texte(row.photo),
      }))
      .filter((row) => row.numero);
    return NextResponse.json({ articles, total: articles.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!autorise(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("photo");
    const refsRaw = String(form.get("refs") || "[]");
    if (!(file instanceof File)) return NextResponse.json({ error: "Photo manquante" }, { status: 400 });
    if (file.type !== "image/png") return NextResponse.json({ error: "Le fichier doit être au format PNG" }, { status: 400 });

    let refs: string[] = [];
    try {
      refs = JSON.parse(refsRaw);
    } catch {
      return NextResponse.json({ error: "Liste des références invalide" }, { status: 400 });
    }
    refs = [...new Set(refs.map((ref) => String(ref).trim()).filter(Boolean))];
    if (!refs.length) return NextResponse.json({ error: "Sélectionnez au moins un article" }, { status: 400 });
    if (refs.length > 250) return NextResponse.json({ error: "Maximum 250 articles par envoi" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const succes: { ref: string; photo: string }[] = [];
    const erreurs: { ref: string; erreur: string }[] = [];

    for (const ref of refs) {
      try {
        const filename = nomFichierPourRef(ref);
        await uploaderPng(filename, bytes);
        await mettreAJourPhotoArticle(ref, filename);
        succes.push({ ref, photo: filename });
      } catch (error) {
        erreurs.push({ ref, erreur: error instanceof Error ? error.message : "Erreur" });
      }
    }

    return NextResponse.json({ succes, erreurs, total: refs.length }, { status: erreurs.length ? 207 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
