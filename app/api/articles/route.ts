import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "../../../lib-auth";

export const dynamic = "force-dynamic";

type JsonRow = Record<string, unknown>;
type BarcodeType = "EAN13" | "CODE39" | "CODE128";

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
  return [...map.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
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
    const missing = [!url ? "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL" : "", !key ? "SUPABASE_SERVICE_ROLE_KEY" : ""].filter(Boolean);
    throw new Error(`Configuration Supabase incomplète : ${missing.join(", ")}`);
  }
  return {
    url,
    key,
    famillesTable: process.env.FAMILLES_TABLE || "familles",
    articlesTable: process.env.ARTICLES_TABLE || "articles",
    codesTable: process.env.CODES_BARRES_TABLE || "ds_code_barre",
    correspondanceTable: process.env.CORRESPONDANCE_TABLE || "correspondance",
  };
}

async function lireTable(table: string, params: Record<string, string>): Promise<JsonRow[]> {
  const { url, key } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(table)}`, url);
  Object.entries(params).forEach(([name, value]) => endpoint.searchParams.set(name, value));
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public" },
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Lecture Supabase ${table}:`, details);
    throw new Error(`Lecture de la table ${table} impossible`);
  }
  return (await response.json()) as JsonRow[];
}

function filtreEq(value: string): string { return `eq.${value}`; }
function filtreIn(values: string[]): string {
  const encoded = values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",");
  return `in.(${encoded})`;
}

async function activites(): Promise<string[]> {
  if (cacheActivites && cacheActivites.expiresAt > Date.now()) return cacheActivites.values;
  const { famillesTable } = config();
  const rows = await lireTable(famillesTable, {
    select: "activite_ds",
    activite_ds: "not.is.null",
    order: "activite_ds.asc",
    limit: "50000",
  });
  const values = valeursUniques(rows.map((row) => texte(row.activite_ds)));
  cacheActivites = { expiresAt: Date.now() + CACHE_MS, values };
  return values;
}

async function groupes(activiteDs: string): Promise<string[]> {
  const cacheKey = normaliser(activiteDs || "Tous");
  const cached = cacheGroupes.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.values;
  const { famillesTable } = config();
  const params: Record<string, string> = { select: "groupe,activite_ds", limit: "50000" };
  if (activiteDs && activiteDs !== "Tous") params.activite_ds = filtreEq(activiteDs);
  const rows = await lireTable(famillesTable, params);
  const values = valeursUniques(rows.map((row) => texte(row.groupe)));
  cacheGroupes.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, values });
  return values;
}

async function famillesFiltrees(activiteDs: string, groupe: string): Promise<JsonRow[]> {
  const { famillesTable } = config();
  const params: Record<string, string> = { select: "famille,activite_ds,groupe", limit: "50000" };
  if (activiteDs && activiteDs !== "Tous") params.activite_ds = filtreEq(activiteDs);
  if (groupe && groupe !== "Tous") params.groupe = filtreEq(groupe);
  return lireTable(famillesTable, params);
}

async function articles(activiteDs: string, groupe: string, q: string) {
  const familles = await famillesFiltrees(activiteDs, groupe);
  const familleParCode = new Map<string, { activiteDs: string; groupe: string }>();
  for (const row of familles) {
    const code = texte(row.famille);
    if (code && !familleParCode.has(code)) {
      familleParCode.set(code, { activiteDs: texte(row.activite_ds), groupe: texte(row.groupe) });
    }
  }
  const famillesCodes = [...familleParCode.keys()];
  if (!famillesCodes.length) return [];

  const { articlesTable, codesTable, correspondanceTable } = config();
  const articleRows: JsonRow[] = [];
  const chunkSize = 150;
  for (let i = 0; i < famillesCodes.length; i += chunkSize) {
    articleRows.push(...await lireTable(articlesTable, {
      select: "articles_numero,articles_nomfr,articles_famille,articles_prix_vente",
      articles_famille: filtreIn(famillesCodes.slice(i, i + chunkSize)),
      order: "articles_numero.asc",
      limit: "10000",
    }));
  }

  const recherche = normaliser(q);
  const articlesBase = articleRows
    .map((row) => ({
      numero: texte(row.articles_numero).replace(/\.0$/, ""),
      libelle: texte(row.articles_nomfr),
      famille: texte(row.articles_famille),
      prix: texte(row.articles_prix_vente),
    }))
    .filter((row) => row.numero && (!recherche || normaliser(`${row.numero} ${row.libelle} ${row.famille}`).includes(recherche)));

  const numeros = valeursUniques(articlesBase.map((row) => row.numero));
  const codesParRef = new Map<string, JsonRow>();
  for (let i = 0; i < numeros.length; i += chunkSize) {
    const rows = await lireTable(codesTable, {
      select: "ref_ds,ref_fournisseur,groupe_articles,code_remise,code_barre,type_code_barre",
      ref_ds: filtreIn(numeros.slice(i, i + chunkSize)),
      limit: "10000",
    });
    for (const row of rows) {
      const ref = texte(row.ref_ds).replace(/\.0$/, "");
      if (!ref) continue;
      const existing = codesParRef.get(ref);
      if (!existing || (!texte(existing.code_barre) && texte(row.code_barre))) codesParRef.set(ref, row);
    }
  }

  const activitesUtiles = valeursUniques([...familleParCode.values()].map((x) => x.activiteDs));
  const secteurParActivite = new Map<string, string>();
  if (activitesUtiles.length) {
    const rows = await lireTable(correspondanceTable, {
      select: "activite_ds,secteur",
      activite_ds: filtreIn(activitesUtiles),
      limit: "1000",
    });
    for (const row of rows) {
      const a = texte(row.activite_ds);
      const s = texte(row.secteur);
      if (a && s && !secteurParActivite.has(normaliser(a))) secteurParActivite.set(normaliser(a), s);
    }
  }

  const map = new Map<string, any>();
  for (const row of articlesBase) {
    if (map.has(row.numero)) continue;
    const fam = familleParCode.get(row.famille) || { activiteDs: "", groupe: "" };
    const code = codesParRef.get(row.numero) || {};
    const barcode = texte(code.code_barre).replace(/\.0$/, "").replace(/\s/g, "");
    const prixNombre = Number(row.prix.replace(/\s/g, "").replace(",", "."));
    map.set(row.numero, {
      numero: row.numero,
      refFournisseur: texte(code.ref_fournisseur),
      groupe: fam.groupe,
      famille: row.famille,
      libelle: row.libelle,
      activiteDs: fam.activiteDs,
      secteur: secteurParActivite.get(normaliser(fam.activiteDs)) || fam.activiteDs,
      prix: Number.isFinite(prixNombre) ? prixNombre.toFixed(2) : "",
      barcode,
      barcodeType: typeCodeBarre(code.type_code_barre, barcode),
      groupeArticles: texte(code.groupe_articles),
      remise: texte(code.code_remise),
    });
  }

  return [...map.values()]
    .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }))
    .slice(0, 5000);
}

export async function GET(request: NextRequest) {
  if (!sessionTokenIsValid(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const action = request.nextUrl.searchParams.get("action") || "secteurs";
    const activiteDs = request.nextUrl.searchParams.get("activite_ds")?.trim() || "Tous";
    const groupe = request.nextUrl.searchParams.get("groupe")?.trim() || "Tous";
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";

    if (action === "secteurs" || action === "activites") {
      const values = await activites();
      return NextResponse.json({ secteurs: values, activites: values });
    }
    if (action === "groupes") return NextResponse.json({ groupes: await groupes(activiteDs) });
    if (action === "articles") {
      const values = await articles(activiteDs, groupe, q);
      return NextResponse.json({ articles: values, total: values.length });
    }
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
