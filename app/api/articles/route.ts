import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "../../../lib-auth";

export const dynamic = "force-dynamic";

type JsonRow = Record<string, unknown>;
type BarcodeType = "EAN13" | "CODE39" | "CODE128";

const VIEW_ARTICLES = "v_generateur_etiquettes";
const PAGE_SIZE_DEFAULT = 500;
const PAGE_SIZE_MAX = 1000;
const CACHE_MS = 5 * 60 * 1000;

let cacheActivites: { expiresAt: number; values: string[] } | null = null;
const cacheGroupes = new Map<string, { expiresAt: number; values: string[] }>();

function texte(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normaliser(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function valeursUniques(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of values) {
    const propre = value.trim();
    if (!propre || propre === "--") continue;
    const key = normaliser(propre);
    if (!map.has(key)) map.set(key, propre);
  }
  return [...map.values()].sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base", numeric: true }),
  );
}

function typeCodeBarre(value: unknown, barcode: string): BarcodeType {
  const type = texte(value).toUpperCase().replace(/[\s_-]+/g, "");
  if (type === "EAN13" || type === "EAN") return "EAN13";
  if (type === "CODE39") return "CODE39";
  if (type === "CODE128") return "CODE128";
  return /^\d{13}$/.test(barcode) ? "EAN13" : "CODE128";
}

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const missing = [
      !url ? "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL" : "",
      !key ? "SUPABASE_SERVICE_ROLE_KEY" : "",
    ].filter(Boolean);
    throw new Error(`Configuration Supabase incomplète : ${missing.join(", ")}`);
  }
  return { url, key };
}

function headersSupabase(extra: Record<string, string> = {}) {
  const { key } = config();
  return {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    Accept: "application/json",
    "Accept-Profile": "public",
    ...extra,
  };
}

async function lireRows(
  table: string,
  params: Record<string, string>,
  countExact = false,
): Promise<{ rows: JsonRow[]; total: number | null }> {
  const { url } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(table)}`, url);
  for (const [name, value] of Object.entries(params)) {
    endpoint.searchParams.set(name, value);
  }

  const response = await fetch(endpoint, {
    headers: headersSupabase(countExact ? { Prefer: "count=exact" } : {}),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(`Lecture Supabase ${table}:`, details);
    throw new Error(`Lecture de ${table} impossible : ${details}`);
  }

  const rows = (await response.json()) as JsonRow[];
  let total: number | null = null;
  if (countExact) {
    const range = response.headers.get("content-range") || "";
    const match = range.match(/\/(\d+)$/);
    if (match) total = Number(match[1]);
  }
  return { rows, total };
}

async function activites(): Promise<string[]> {
  if (cacheActivites && cacheActivites.expiresAt > Date.now()) return cacheActivites.values;
  const { rows } = await lireRows("familles", {
    select: "activite_ds",
    activite_ds: "not.is.null",
    order: "activite_ds.asc",
    limit: "5000",
  });
  const values = valeursUniques(rows.map((row) => texte(row.activite_ds)));
  cacheActivites = { expiresAt: Date.now() + CACHE_MS, values };
  return values;
}

async function groupes(activiteDs: string): Promise<string[]> {
  const cacheKey = normaliser(activiteDs || "Tous");
  const cached = cacheGroupes.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.values;

  const params: Record<string, string> = {
    select: "groupe",
    groupe: "not.is.null",
    order: "groupe.asc",
    limit: "5000",
  };
  if (activiteDs && activiteDs !== "Tous") params.activite_ds = `eq.${activiteDs}`;

  const { rows } = await lireRows("familles", params);
  const values = valeursUniques(rows.map((row) => texte(row.groupe)));
  cacheGroupes.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, values });
  return values;
}

function nettoyerRecherche(q: string): string {
  // Les caractères ci-dessous ont une signification particulière dans la syntaxe
  // logique PostgREST. Les retirer évite de casser le filtre "or".
  return q.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

async function articles(
  activiteDs: string,
  groupe: string,
  q: string,
  pageDemandee: number,
  pageSizeDemande: number,
) {
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, pageSizeDemande || PAGE_SIZE_DEFAULT),
  );
  const page = Math.max(1, pageDemandee || 1);
  const offset = (page - 1) * pageSize;

  const params: Record<string, string> = {
    select:
      "reference_ds,reference_fournisseur,activite_ds,groupe,famille,libelle,secteur,prix,code_barre,type_code_barre,articles_photo",
    order: "reference_ds.asc",
    limit: String(pageSize),
    offset: String(offset),
  };

  if (activiteDs && activiteDs !== "Tous") params.activite_ds = `eq.${activiteDs}`;
  if (groupe && groupe !== "Tous") params.groupe = `eq.${groupe}`;

  const recherche = nettoyerRecherche(q);
  if (recherche) {
    const motif = `*${recherche}*`;
    params.or = `(${[
      `reference_ds.ilike.${motif}`,
      `libelle.ilike.${motif}`,
      `reference_fournisseur.ilike.${motif}`,
      `famille.ilike.${motif}`,
    ].join(",")})`;
  }

  const { rows, total } = await lireRows(VIEW_ARTICLES, params, true);
  const nombreTotal = total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(nombreTotal / pageSize));

  const values = rows.map((row) => {
    const barcode = texte(row.code_barre).replace(/\.0$/, "").replace(/\s/g, "");
    const prixBrut = texte(row.prix).replace(/\s/g, "").replace(",", ".");
    const prixNombre = Number(prixBrut);
    return {
      numero: texte(row.reference_ds).replace(/\.0$/, ""),
      refFournisseur: texte(row.reference_fournisseur),
      activiteDs: texte(row.activite_ds),
      groupe: texte(row.groupe),
      famille: texte(row.famille),
      libelle: texte(row.libelle),
      secteur: texte(row.secteur),
      prix: Number.isFinite(prixNombre) ? prixNombre.toFixed(2) : "",
      barcode,
      barcodeType: typeCodeBarre(row.type_code_barre, barcode),
      photo: texte(row.articles_photo),
    };
  });

  return {
    articles: values,
    total: nombreTotal,
    page,
    pageSize,
    totalPages,
  };
}


async function referencesFiltrees(
  activiteDs: string,
  groupe: string,
  q: string,
): Promise<string[]> {
  const baseParams: Record<string, string> = {
    select: "reference_ds",
    order: "reference_ds.asc",
  };

  if (activiteDs && activiteDs !== "Tous") baseParams.activite_ds = `eq.${activiteDs}`;
  if (groupe && groupe !== "Tous") baseParams.groupe = `eq.${groupe}`;

  const recherche = nettoyerRecherche(q);
  if (recherche) {
    const motif = `*${recherche}*`;
    baseParams.or = `(${[
      `reference_ds.ilike.${motif}`,
      `libelle.ilike.${motif}`,
      `reference_fournisseur.ilike.${motif}`,
      `famille.ilike.${motif}`,
    ].join(",")})`;
  }

  const resultat: string[] = [];
  const tailleLot = 1000;

  for (let offset = 0; ; offset += tailleLot) {
    const { rows } = await lireRows(VIEW_ARTICLES, {
      ...baseParams,
      limit: String(tailleLot),
      offset: String(offset),
    });

    for (const row of rows) {
      const ref = texte(row.reference_ds).replace(/\.0$/, "");
      if (ref) resultat.push(ref);
    }

    if (rows.length < tailleLot) break;
  }

  return [...new Set(resultat)];
}

async function detailArticle(numero: string) {
  const { rows } = await lireRows(VIEW_ARTICLES, {
    select:
      "reference_ds,reference_fournisseur,activite_ds,groupe,famille,libelle,secteur,prix,code_barre,type_code_barre,articles_photo",
    reference_ds: `eq.${numero}`,
    limit: "1",
  });
  const row = rows[0];
  if (!row) throw new Error("Article introuvable");

  const barcode = texte(row.code_barre).replace(/\.0$/, "").replace(/\s/g, "");
  const prixBrut = texte(row.prix).replace(/\s/g, "").replace(",", ".");
  const prixNombre = Number(prixBrut);

  return {
    refds: texte(row.reference_ds).replace(/\.0$/, ""),
    reffour: texte(row.reference_fournisseur),
    activiteDs: texte(row.activite_ds),
    groupe: texte(row.groupe),
    famille: texte(row.famille),
    libelle: texte(row.libelle),
    secteur: texte(row.secteur),
    prix: Number.isFinite(prixNombre) ? prixNombre.toFixed(2) : "",
    barcode,
    barcodeType: typeCodeBarre(row.type_code_barre, barcode),
    photo: texte(row.articles_photo),
  };
}

export async function GET(request: NextRequest) {
  if (!sessionTokenIsValid(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const action = request.nextUrl.searchParams.get("action") || "secteurs";
    const activiteDs = request.nextUrl.searchParams.get("activite_ds")?.trim() || "Tous";
    const groupe = request.nextUrl.searchParams.get("groupe")?.trim() || "Tous";
    const numero = request.nextUrl.searchParams.get("numero")?.trim() || "";
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    const pageSize = Number(
      request.nextUrl.searchParams.get("page_size") || String(PAGE_SIZE_DEFAULT),
    );

    if (action === "secteurs" || action === "activites") {
      const values = await activites();
      return NextResponse.json({ secteurs: values, activites: values });
    }
    if (action === "groupes") {
      return NextResponse.json({ groupes: await groupes(activiteDs) });
    }
    if (action === "articles") {
      return NextResponse.json(await articles(activiteDs, groupe, q, page, pageSize));
    }
    if (action === "references_filtrees") {
      const references = await referencesFiltrees(activiteDs, groupe, q);
      return NextResponse.json({ references, total: references.length });
    }
    if (action === "detail") {
      if (!numero) {
        return NextResponse.json({ error: "Numéro d’article manquant" }, { status: 400 });
      }
      return NextResponse.json({ article: await detailArticle(numero) });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
