import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "../../../lib-auth";

export const dynamic = "force-dynamic";

type VueArticle = {
  ref_ds?: unknown;
  ref_fournisseur?: unknown;
  type_code_barre?: unknown;
  code_barre?: unknown;
  famille?: unknown;
  groupe?: unknown;
  activite_ds?: unknown;
  groupe_articles_code_barre?: unknown;
  secteur?: unknown;
  libelle?: unknown;
  prix_pvp_htva?: unknown;
  code_remise?: unknown;
  ds_code_barre_id?: unknown;
};

type ArticleEtiquette = {
  id: string;
  refds: string;
  reffour: string;
  barcodeType: "EAN13" | "CODE39" | "CODE128";
  barcode: string;
  famille: string;
  groupe: string;
  activiteDs: string;
  groupeArticles: string;
  secteur: string;
  libelle: string;
  prix: string;
  remise: string;
};

const CACHE_MS = 5 * 60 * 1000;
let cache: { expiresAt: number; rows: ArticleEtiquette[] } | null = null;

function texte(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normaliser(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function typeCodeBarre(value: unknown, barcode: string): "EAN13" | "CODE39" | "CODE128" {
  const type = texte(value).toUpperCase().replace(/[\s_-]+/g, "");
  if (type === "EAN13" || type === "EAN") return "EAN13";
  if (type === "CODE39") return "CODE39";
  if (type === "CODE128") return "CODE128";
  return /^\d{13}$/.test(barcode) ? "EAN13" : "CODE128";
}

function mapper(row: VueArticle): ArticleEtiquette {
  const barcode = texte(row.code_barre).replace(/\.0$/, "").replace(/\s/g, "");
  const prixBrut = texte(row.prix_pvp_htva).replace(/\s/g, "").replace(",", ".");
  const prixNombre = Number(prixBrut);
  const refds = texte(row.ref_ds).replace(/\.0$/, "");
  const idCode = texte(row.ds_code_barre_id);

  return {
    id: idCode || `${refds}:${barcode || "sans-code"}`,
    refds,
    reffour: texte(row.ref_fournisseur),
    barcodeType: typeCodeBarre(row.type_code_barre, barcode),
    barcode,
    famille: texte(row.famille),
    groupe: texte(row.groupe),
    activiteDs: texte(row.activite_ds),
    groupeArticles: texte(row.groupe_articles_code_barre),
    secteur: texte(row.secteur) || texte(row.activite_ds),
    libelle: texte(row.libelle),
    prix: Number.isFinite(prixNombre) ? prixNombre.toFixed(2) : "",
    remise: texte(row.code_remise),
  };
}

async function chargerVue(): Promise<ArticleEtiquette[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("Configuration Supabase incomplète");
  }

  const view = process.env.ARTICLES_VIEW || "v_articles_etiquettes";
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(view)}`, supabaseUrl);
  endpoint.searchParams.set(
    "select",
    "ref_ds,ref_fournisseur,type_code_barre,code_barre,famille,groupe,activite_ds,groupe_articles_code_barre,secteur,libelle,prix_pvp_htva,code_remise,ds_code_barre_id",
  );
  endpoint.searchParams.set("limit", "50000");

  const response = await fetch(endpoint, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Accept: "application/json",
      "Accept-Profile": "public",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Lecture vue étiquettes :", details);
    throw new Error("Lecture de la vue v_articles_etiquettes impossible");
  }

  const data = (await response.json()) as VueArticle[];
  const rows = data.map(mapper).filter((row) => row.refds || row.libelle);
  cache = { expiresAt: Date.now() + CACHE_MS, rows };
  return rows;
}

function valeursUniques(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of values) {
    const propre = value.trim();
    if (!propre) continue;
    const key = normaliser(propre);
    if (!map.has(key)) map.set(key, propre);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

export async function GET(request: NextRequest) {
  if (!sessionTokenIsValid(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const rows = await chargerVue();
    const action = request.nextUrl.searchParams.get("action") || "articles";
    const secteur = request.nextUrl.searchParams.get("secteur")?.trim() || "";
    const groupe = request.nextUrl.searchParams.get("groupe")?.trim() || "";
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";

    if (action === "secteurs") {
      return NextResponse.json({ secteurs: valeursUniques(rows.map((row) => row.secteur)) });
    }

    const lignesSecteur = secteur && secteur !== "Tous"
      ? rows.filter((row) => normaliser(row.secteur) === normaliser(secteur))
      : rows;

    if (action === "groupes") {
      return NextResponse.json({ groupes: valeursUniques(lignesSecteur.map((row) => row.groupe)) });
    }

    let articles = lignesSecteur;
    if (groupe && groupe !== "Tous") {
      articles = articles.filter((row) => normaliser(row.groupe) === normaliser(groupe));
    }
    if (q) {
      const recherche = normaliser(q);
      articles = articles.filter((row) =>
        [row.refds, row.reffour, row.barcode, row.libelle, row.famille, row.groupe, row.secteur]
          .some((value) => normaliser(value).includes(recherche)),
      );
    }

    articles = articles
      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }))
      .slice(0, 2000);

    return NextResponse.json(
      { articles, total: articles.length },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
