import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "../../../lib-auth";

export const dynamic = "force-dynamic";

type JsonRow = Record<string, unknown>;
type BarcodeType = "EAN13" | "CODE39" | "CODE128";

const CACHE_MS = 5 * 60 * 1000;
let cacheSecteurs: { expiresAt: number; values: string[] } | null = null;
const cacheGroupes = new Map<string, { expiresAt: number; values: string[] }>();

function texte(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normaliser(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function valeursUniques(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of values) {
    const propre = value.trim();
    if (!propre) continue;
    const key = normaliser(propre);
    if (!map.has(key)) map.set(key, propre);
  }
  return [...map.values()].sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
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
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Configuration Supabase incomplète");
  }

  return {
    url,
    key,
    famillesTable: process.env.FAMILLES_TABLE || "familles",
    articlesTable: process.env.ARTICLES_TABLE || "articles",
    codesTable: process.env.CODES_BARRES_TABLE || "ds_code_barre",
    correspondanceTable:
      process.env.CORRESPONDANCE_TABLE || "correspondance",
  };
}

async function lireTable(
  table: string,
  params: Record<string, string>,
): Promise<JsonRow[]> {
  const { url, key } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(table)}`, url);
  Object.entries(params).forEach(([name, value]) => endpoint.searchParams.set(name, value));

  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": "public",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(`Lecture Supabase ${table}:`, details);
    throw new Error(`Lecture de la table ${table} impossible`);
  }

  return (await response.json()) as JsonRow[];
}

async function lireFamilles(params: Record<string, string>): Promise<JsonRow[]> {
  const { famillesTable } = config();
  return lireTable(famillesTable, params);
}

function filtreEq(value: string): string {
  return `eq.${value}`;
}

function filtreIn(values: string[]): string {
  const encoded = values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",");
  return `in.(${encoded})`;
}

async function secteurs(): Promise<string[]> {
  if (cacheSecteurs && cacheSecteurs.expiresAt > Date.now()) {
    return cacheSecteurs.values;
  }

  // Source unique du menu Secteur : familles.activite_ds.
  // Aucune valeur n'est codée en dur.
  const rows = await lireFamilles({
    select: "activite_ds",
    activite_ds: "not.is.null",
    order: "activite_ds.asc",
    limit: "50000",
  });

  const values = valeursUniques(
    rows.map((row) => texte(row.activite_ds)).filter(Boolean),
  );

  cacheSecteurs = { expiresAt: Date.now() + CACHE_MS, values };
  return values;
}

async function groupes(activiteDs: string): Promise<string[]> {
  const cacheKey = normaliser(activiteDs || "Tous");
  const cached = cacheGroupes.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.values;

  const params: Record<string, string> = { select: "groupe,activite_ds", limit: "50000" };
  if (activiteDs && activiteDs !== "Tous") params.activite_ds = filtreEq(activiteDs);
  const rows = await lireFamilles(params);
  const values = valeursUniques(rows.map((row) => texte(row.groupe)));
  cacheGroupes.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, values });
  return values;
}

async function famillesFiltrees(activiteDs: string, groupe: string): Promise<JsonRow[]> {
  const params: Record<string, string> = {
    select: "famille,activite_ds,groupe",
    limit: "50000",
  };
  if (activiteDs && activiteDs !== "Tous") params.activite_ds = filtreEq(activiteDs);
  if (groupe && groupe !== "Tous") params.groupe = filtreEq(groupe);
  return lireFamilles(params);
}

async function articles(activiteDs: string, groupe: string, q: string) {
  const familles = await famillesFiltrees(activiteDs, groupe);
  const famillesCodes = valeursUniques(familles.map((row) => texte(row.famille)));
  if (!famillesCodes.length) return [];

  const { articlesTable } = config();
  const results: JsonRow[] = [];
  const chunkSize = 150;

  for (let index = 0; index < famillesCodes.length; index += chunkSize) {
    const chunk = famillesCodes.slice(index, index + chunkSize);
    const rows = await lireTable(articlesTable, {
      select: "articles_numero,articles_nomfr,articles_famille,articles_prix_vente",
      articles_famille: filtreIn(chunk),
      order: "articles_numero.asc",
      limit: "10000",
    });
    results.push(...rows);
  }

  const recherche = normaliser(q);
  const map = new Map<string, { numero: string; libelle: string; famille: string; prix: string }>();
  for (const row of results) {
    const numero = texte(row.articles_numero).replace(/\.0$/, "");
    const libelle = texte(row.articles_nomfr);
    if (!numero) continue;
    if (recherche && !normaliser(`${numero} ${libelle}`).includes(recherche)) continue;
    if (!map.has(numero)) {
      map.set(numero, {
        numero,
        libelle,
        famille: texte(row.articles_famille),
        prix: texte(row.articles_prix_vente),
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }))
    .slice(0, 5000);
}

async function detailArticle(numero: string) {
  const { articlesTable, codesTable, correspondanceTable } = config();

  const articleRows = await lireTable(articlesTable, {
    select: "articles_numero,articles_nomfr,articles_famille,articles_prix_vente",
    articles_numero: filtreEq(numero),
    limit: "1",
  });
  const article = articleRows[0];
  if (!article) throw new Error("Article introuvable");

  const familleCode = texte(article.articles_famille);
  const familleRows = await lireFamilles({
    select: "famille,activite_ds,groupe",
    famille: filtreEq(familleCode),
    limit: "1",
  });
  const famille = familleRows[0] || {};

  const codeRows = await lireTable(codesTable, {
    select: "id,ref_ds,ref_fournisseur,groupe_articles,code_remise,code_barre,type_code_barre",
    ref_ds: filtreEq(numero),
    order: "id.asc",
    limit: "100",
  });
  const code = codeRows.find((row) => texte(row.code_barre)) || codeRows[0] || {};

  const activiteDs = texte(famille.activite_ds);
  const groupeFamille = texte(famille.groupe);
  const groupeArticles = texte(code.groupe_articles);
  let secteur = activiteDs;

  if (groupeArticles) {
    const correspondances = await lireTable(correspondanceTable, {
      select: "activite_ds,groupe_articles,secteur",
      groupe_articles: filtreEq(groupeArticles),
      limit: "20",
    });
    const exacte = correspondances.find(
      (row) => !activiteDs || normaliser(texte(row.activite_ds)) === normaliser(activiteDs),
    );
    secteur = texte(exacte?.secteur) || texte(correspondances[0]?.secteur) || activiteDs;
  }

  const barcode = texte(code.code_barre).replace(/\.0$/, "").replace(/\s/g, "");
  const prixBrut = texte(article.articles_prix_vente).replace(/\s/g, "").replace(",", ".");
  const prixNombre = Number(prixBrut);

  return {
    refds: texte(article.articles_numero).replace(/\.0$/, ""),
    reffour: texte(code.ref_fournisseur),
    barcode,
    barcodeType: typeCodeBarre(code.type_code_barre, barcode),
    famille: familleCode,
    groupe: groupeFamille,
    activiteDs,
    groupeArticles,
    secteur,
    remise: texte(code.code_remise),
    libelle: texte(article.articles_nomfr),
    prix: Number.isFinite(prixNombre) ? prixNombre.toFixed(2) : "",
    codesBarres: codeRows.map((row) => {
      const value = texte(row.code_barre).replace(/\.0$/, "").replace(/\s/g, "");
      return {
        id: texte(row.id),
        barcode: value,
        barcodeType: typeCodeBarre(row.type_code_barre, value),
        reffour: texte(row.ref_fournisseur),
        groupeArticles: texte(row.groupe_articles),
        remise: texte(row.code_remise),
      };
    }),
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

    if (action === "secteurs" || action === "activites") {
      const values = await secteurs();
      return NextResponse.json({ secteurs: values, activites: values });
    }
    if (action === "groupes") {
      return NextResponse.json({ groupes: await groupes(activiteDs) });
    }
    if (action === "articles") {
      const values = await articles(activiteDs, groupe, q);
      return NextResponse.json({ articles: values, total: values.length });
    }
    if (action === "detail") {
      if (!numero) return NextResponse.json({ error: "Numéro d’article manquant" }, { status: 400 });
      return NextResponse.json({ article: await detailArticle(numero) });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
