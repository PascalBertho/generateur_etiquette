import { NextRequest, NextResponse } from "next/server";
import { sessionTokenIsValid, SESSION_COOKIE } from "../../../../lib-auth";

export const dynamic = "force-dynamic";

type JsonRow = Record<string, unknown>;
type PhotoInput = { name?: unknown; size?: unknown; lastModified?: unknown };
type ImportAction = "upload" | "existing" | "link-only" | "ambiguous" | "no-match";

type AnalysisRow = {
  sourceName: string;
  articleNumero: string;
  targetName: string;
  matchType: string;
  action: ImportAction;
  detail: string;
};

const TABLE = process.env.ARTICLES_TABLE || "articles";
const BUCKET = process.env.PHOTOS_BUCKET || "articles_photo";
const ARTICLE_COL = "articles_numero";
const PHOTO_COL = "articles_photo";

function autorise(request: NextRequest): boolean {
  return sessionTokenIsValid(request.cookies.get(SESSION_COOKIE)?.value);
}

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Configuration Supabase incomplète : SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis",
    );
  }

  if (!anonKey) {
    throw new Error(
      "Configuration Supabase incomplète : SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY est requis pour l'import signé",
    );
  }

  return { url, key, anonKey };
}

function headersSupabase(extra: Record<string, string> = {}) {
  const { key } = config();
  return {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
    ...extra,
  };
}

function texte(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normaliser(value: unknown): string {
  return texte(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sansExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function nomCible(articleNumero: string): string {
  const propre = articleNumero.trim().replace(/[\\/]/g, "_");
  if (!propre) throw new Error("Référence article vide");
  return `${propre}.png`;
}

async function lireTousArticles(): Promise<JsonRow[]> {
  const { url } = config();
  const resultat: JsonRow[] = [];
  const tailleLot = 1000;

  for (let offset = 0; ; offset += tailleLot) {
    const endpoint = new URL(`/rest/v1/${encodeURIComponent(TABLE)}`, url);
    endpoint.searchParams.set("select", `${ARTICLE_COL},${PHOTO_COL}`);
    endpoint.searchParams.set(ARTICLE_COL, "not.is.null");
    endpoint.searchParams.set("order", `${ARTICLE_COL}.asc`);
    endpoint.searchParams.set("limit", String(tailleLot));
    endpoint.searchParams.set("offset", String(offset));

    const response = await fetch(endpoint, {
      headers: headersSupabase(),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Lecture table ${TABLE} impossible : ${details}`);
    }

    const rows = (await response.json()) as JsonRow[];
    resultat.push(...rows);
    if (rows.length < tailleLot) break;
  }

  return resultat;
}

async function listerBucket(): Promise<Set<string>> {
  const { url } = config();
  const resultat = new Set<string>();
  const tailleLot = 1000;

  for (let offset = 0; ; offset += tailleLot) {
    const endpoint = new URL(`/storage/v1/object/list/${encodeURIComponent(BUCKET)}`, url);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: headersSupabase(),
      body: JSON.stringify({
        prefix: "",
        limit: tailleLot,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Lecture bucket ${BUCKET} impossible : ${details}`);
    }

    const rows = (await response.json()) as JsonRow[];
    for (const row of rows) {
      const name = texte(row.name);
      // Une entrée dossier n'a généralement pas d'id. On ne garde que les objets.
      if (name && row.id) resultat.add(name.toLowerCase());
    }
    if (rows.length < tailleLot) break;
  }

  return resultat;
}

function construireIndexPhotos(files: PhotoInput[]) {
  return files
    .map((file) => texte(file.name))
    .filter((name) => /\.png$/i.test(name))
    .map((name) => ({
      name,
      normalized: normaliser(sansExtension(name)),
    }))
    .filter((photo) => photo.normalized);
}

function chercherPhoto(articleNumero: string, photos: { name: string; normalized: string }[]) {
  const articleNorm = normaliser(articleNumero);
  if (!articleNorm) return { type: "aucune" as const };

  const exactes = photos.filter((photo) => photo.normalized === articleNorm);
  if (exactes.length === 1) {
    return { type: "exacte" as const, photo: exactes[0], detail: "" };
  }
  if (exactes.length > 1) {
    return {
      type: "ambigue" as const,
      detail: `Plusieurs fichiers correspondent exactement : ${exactes.map((p) => p.name).join(" | ")}`,
    };
  }

  const prefixes = photos.filter((photo) => articleNorm.startsWith(photo.normalized));
  if (!prefixes.length) return { type: "aucune" as const };

  const longueurMax = Math.max(...prefixes.map((photo) => photo.normalized.length));
  const meilleurs = prefixes.filter((photo) => photo.normalized.length === longueurMax);

  if (meilleurs.length === 1) {
    return {
      type: "prefixe" as const,
      photo: meilleurs[0],
      detail: `Préfixe retenu : ${meilleurs[0].name}`,
    };
  }

  return {
    type: "ambigue" as const,
    detail: `Plusieurs meilleurs préfixes : ${meilleurs.map((p) => p.name).join(" | ")}`,
  };
}

async function analyser(files: PhotoInput[]): Promise<AnalysisRow[]> {
  const photos = construireIndexPhotos(files);
  const [articles, fichiersBucket] = await Promise.all([
    lireTousArticles(),
    listerBucket(),
  ]);

  const rows: AnalysisRow[] = [];
  const sourcesUtilisees = new Set<string>();

  for (const article of articles) {
    const articleNumero = texte(article[ARTICLE_COL]).replace(/\.0$/, "");
    if (!articleNumero) continue;

    const match = chercherPhoto(articleNumero, photos);
    if (match.type === "aucune") continue;

    if (match.type === "ambigue") {
      rows.push({
        sourceName: "",
        articleNumero,
        targetName: "",
        matchType: "ambigue",
        action: "ambiguous",
        detail: match.detail,
      });
      continue;
    }

    const sourceName = match.photo.name;
    const targetName = nomCible(articleNumero);
    const existe = fichiersBucket.has(targetName.toLowerCase());
    const photoDb = texte(article[PHOTO_COL]);
    sourcesUtilisees.add(sourceName.toLowerCase());

    if (existe) {
      const dbOk = photoDb.toLowerCase() === targetName.toLowerCase();
      rows.push({
        sourceName,
        articleNumero,
        targetName,
        matchType: match.type,
        action: dbOk ? "existing" : "link-only",
        detail: [
          match.detail,
          dbOk
            ? "Déjà présente dans le bucket ; aucun écrasement."
            : "Déjà présente dans le bucket ; seule la colonne articles_photo sera renseignée.",
        ]
          .filter(Boolean)
          .join(" — "),
      });
    } else {
      rows.push({
        sourceName,
        articleNumero,
        targetName,
        matchType: match.type,
        action: "upload",
        detail: [match.detail, "Nouvelle photo à importer."].filter(Boolean).join(" — "),
      });
    }
  }

  for (const photo of photos) {
    if (!sourcesUtilisees.has(photo.name.toLowerCase())) {
      rows.push({
        sourceName: photo.name,
        articleNumero: "",
        targetName: "",
        matchType: "aucune",
        action: "no-match",
        detail: "Aucun article correspondant.",
      });
    }
  }

  const ordre: Record<ImportAction, number> = {
    upload: 1,
    "link-only": 2,
    existing: 3,
    ambiguous: 4,
    "no-match": 5,
  };

  rows.sort(
    (a, b) =>
      ordre[a.action] - ordre[b.action] ||
      (a.sourceName || a.articleNumero).localeCompare(
        b.sourceName || b.articleNumero,
        "fr",
        { numeric: true, sensitivity: "base" },
      ),
  );

  return rows;
}

async function objetExiste(filename: string): Promise<boolean> {
  const { url } = config();
  const endpoint = new URL(
    `/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(filename)}`,
    url,
  );

  const response = await fetch(endpoint, {
    method: "HEAD",
    headers: headersSupabase(),
    cache: "no-store",
  });

  if (response.ok) return true;
  if (response.status === 400 || response.status === 404) return false;

  const details = await response.text().catch(() => "");
  throw new Error(`Contrôle Storage ${filename} impossible : ${details || response.status}`);
}

async function creerUploadSigne(filename: string) {
  const { url } = config();
  const endpoint = new URL(
    `/storage/v1/object/upload/sign/${encodeURIComponent(BUCKET)}/${encodeURIComponent(filename)}`,
    url,
  );

  // Pas de x-upsert : le fichier ne pourra pas être remplacé.
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headersSupabase(),
    body: JSON.stringify({}),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Création URL d'upload impossible : ${details}`);
  }

  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error("Supabase n'a pas renvoyé d'URL d'upload.");

  const signedUrl = data.url.startsWith("http")
    ? data.url
    : `${url}/storage/v1${data.url.startsWith("/") ? "" : "/"}${data.url}`;

  const token = new URL(signedUrl).searchParams.get("token");
  if (!token) throw new Error("Supabase n'a pas renvoyé de token d'upload.");

  return { signedUrl, token };
}

async function mettreAJourPhotoArticle(articleNumero: string, filename: string) {
  const { url } = config();
  const endpoint = new URL(`/rest/v1/${encodeURIComponent(TABLE)}`, url);
  endpoint.searchParams.set(ARTICLE_COL, `eq.${articleNumero}`);

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: headersSupabase({ Prefer: "return=minimal" }),
    body: JSON.stringify({ [PHOTO_COL]: filename }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Mise à jour ${TABLE}.${PHOTO_COL} impossible : ${details}`);
  }
}

export async function POST(request: NextRequest) {
  if (!autorise(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let action = "";

  try {
    const body = (await request.json()) as Record<string, unknown>;
    action = texte(body.action);

    if (action === "analyze") {
      const files = Array.isArray(body.files) ? (body.files as PhotoInput[]) : [];
      if (!files.length) {
        return NextResponse.json({ error: "Aucun fichier reçu pour analyse." }, { status: 400 });
      }
      return NextResponse.json({ rows: await analyser(files) });
    }

    if (action === "prepare") {
      const articleNumero = texte(body.articleNumero).replace(/\.0$/, "");
      const sourceName = texte(body.sourceName);
      const targetName = texte(body.targetName);

      if (!articleNumero || !sourceName || !targetName) {
        return NextResponse.json({ error: "Paramètres prepare incomplets." }, { status: 400 });
      }
      if (!/\.png$/i.test(sourceName) || targetName !== nomCible(articleNumero)) {
        return NextResponse.json({ error: "Nom de fichier non valide." }, { status: 400 });
      }

      // Double contrôle juste avant l'upload : ne jamais remplacer un fichier existant.
      if (await objetExiste(targetName)) {
        const { url, anonKey } = config();
        return NextResponse.json({
          alreadyExists: true,
          path: targetName,
          supabaseUrl: url,
          supabaseAnonKey: anonKey,
        });
      }

      const signed = await creerUploadSigne(targetName);
      const { url, anonKey } = config();

      return NextResponse.json({
        alreadyExists: false,
        path: targetName,
        signedUrl: signed.signedUrl,
        token: signed.token,
        supabaseUrl: url,
        supabaseAnonKey: anonKey,
      });
    }

    if (action === "confirm") {
      const articleNumero = texte(body.articleNumero).replace(/\.0$/, "");
      const targetName = texte(body.targetName);

      if (!articleNumero || targetName !== nomCible(articleNumero)) {
        return NextResponse.json({ error: "Paramètres confirm invalides." }, { status: 400 });
      }

      if (!(await objetExiste(targetName))) {
        return NextResponse.json(
          { error: "Le fichier n'existe pas encore dans le bucket." },
          { status: 409 },
        );
      }

      await mettreAJourPhotoArticle(articleNumero, targetName);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.error("API import photos :", action || "inconnue", error);
    return NextResponse.json(
      { error: message, stage: action || "inconnue" },
      { status: 500 },
    );
  }
}
