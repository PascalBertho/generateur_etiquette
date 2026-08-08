"""
Association automatique des photos produits avec les articles Supabase.

Regles:
1. Correspondance exacte prioritaire:
      FU01130.png -> articles_numero = FU01130
2. Sinon, le nom de la photo peut etre un prefixe de la reference article:
      FU01.png -> FU01130, FU01180, FU01080, ...
3. Si plusieurs photos-prefixes correspondent a un article, le prefixe le plus long gagne.
4. La photo est envoyee dans le bucket "articles_photo" sous le nom:
      <articles_numero>.png
5. La colonne articles.articles_photo est mise a jour avec:
      <articles_numero>.png

Par securite, DRY_RUN=True au premier lancement:
aucun upload et aucune modification Supabase ne sont effectues.
Un rapport CSV est cree pour controle.
"""

from __future__ import annotations

import csv
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from supabase import Client, create_client


# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

PHOTOS_DIR = Path(
    r"C:\Users\p.bertho\Documents\generateur_etiquettes\Photos produits"
)

BUCKET_NAME = "articles_photo"
TABLE_NAME = "articles"
ARTICLE_COLUMN = "articles_numero"
PHOTO_COLUMN = "articles_photo"

# Premier lancement conseille: True.
# Apres verification du rapport, passer a False.
DRY_RUN = False

# Si True, un fichier deja present dans le bucket sera remplace.
OVERWRITE_STORAGE = True

REPORT_FILE = Path(__file__).with_name("rapport_correspondance_photos.csv")


# ---------------------------------------------------------------------------
# OUTILS
# ---------------------------------------------------------------------------

def normalize(value: str) -> str:
    """
    Normalise uniquement pour la comparaison.
    Le nom final dans Supabase conserve la reference article originale.

    Exemples:
      "FU-01130" -> "FU01130"
      "fu 01130" -> "FU01130"
    """
    return re.sub(r"[^A-Z0-9]", "", str(value).upper().strip())


@dataclass
class PhotoFile:
    path: Path
    stem_original: str
    stem_normalized: str


@dataclass
class MatchResult:
    article_numero: str
    source_photo: Optional[Path]
    target_filename: Optional[str]
    match_type: str
    status: str
    detail: str = ""


def get_supabase_client() -> Client:
    """
    Lit les identifiants depuis les variables d'environnement.

    Variables acceptees:
      SUPABASE_URL
      SUPABASE_SERVICE_ROLE_KEY   (recommande pour ce script d'administration)
    ou:
      SUPABASE_KEY
    """
    url = os.getenv("SUPABASE_URL", "").strip()
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_KEY", "").strip()
    )

    if not url or not key:
        print("\nERREUR: identifiants Supabase manquants.")
        print("Definir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY")
        print("ou SUPABASE_URL et SUPABASE_KEY avant de lancer le script.\n")
        sys.exit(1)

    return create_client(url, key)


def load_local_photos() -> list[PhotoFile]:
    if not PHOTOS_DIR.exists():
        raise FileNotFoundError(
            f"Le repertoire des photos est introuvable:\n{PHOTOS_DIR}"
        )

    photos: list[PhotoFile] = []

    for path in sorted(PHOTOS_DIR.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() != ".png":
            continue

        stem_norm = normalize(path.stem)
        if not stem_norm:
            continue

        photos.append(
            PhotoFile(
                path=path,
                stem_original=path.stem,
                stem_normalized=stem_norm,
            )
        )

    return photos


def load_articles(supabase: Client) -> list[str]:
    """
    Charge tous les articles par pagination pour ne pas dependre
    de la limite de lignes par requete.
    """
    articles: list[str] = []
    page_size = 1000
    start = 0

    while True:
        response = (
            supabase.table(TABLE_NAME)
            .select(ARTICLE_COLUMN)
            .range(start, start + page_size - 1)
            .execute()
        )

        rows = response.data or []
        if not rows:
            break

        for row in rows:
            value = row.get(ARTICLE_COLUMN)
            if value is not None and str(value).strip():
                articles.append(str(value).strip())

        if len(rows) < page_size:
            break

        start += page_size

    return articles


def build_indexes(photos: list[PhotoFile]):
    exact_index: dict[str, list[PhotoFile]] = defaultdict(list)

    for photo in photos:
        exact_index[photo.stem_normalized].append(photo)

    return exact_index


def find_photo_for_article(
    article_numero: str,
    photos: list[PhotoFile],
    exact_index: dict[str, list[PhotoFile]],
) -> tuple[Optional[PhotoFile], str, str]:
    """
    Retourne:
      photo, type_correspondance, detail

    Strategie:
      - exact
      - sinon tous les stems photo qui sont prefixe de l'article
      - le prefixe le plus long gagne
      - egalite => ambigu
    """
    article_norm = normalize(article_numero)

    # 1) Correspondance exacte
    exact_matches = exact_index.get(article_norm, [])
    if len(exact_matches) == 1:
        return exact_matches[0], "exacte", ""

    if len(exact_matches) > 1:
        names = " | ".join(str(p.path.name) for p in exact_matches)
        return None, "ambigue", f"Plusieurs photos exactes: {names}"

    # 2) Correspondance par prefixe
    prefix_matches = [
        p for p in photos
        if article_norm.startswith(p.stem_normalized)
    ]

    if not prefix_matches:
        return None, "aucune", ""

    # Plus le prefixe est long, plus la correspondance est specifique.
    max_len = max(len(p.stem_normalized) for p in prefix_matches)
    best = [p for p in prefix_matches if len(p.stem_normalized) == max_len]

    # Evite de traiter plusieurs fichiers equivalant au meme prefixe comme certains.
    unique_paths = {str(p.path).lower(): p for p in best}
    best = list(unique_paths.values())

    if len(best) == 1:
        return best[0], "prefixe", f"Prefixe: {best[0].stem_original}"

    names = " | ".join(str(p.path.name) for p in best)
    return None, "ambigue", f"Plusieurs meilleurs prefixes: {names}"


def upload_photo(
    supabase: Client,
    source_path: Path,
    target_filename: str,
) -> None:
    with source_path.open("rb") as f:
        supabase.storage.from_(BUCKET_NAME).upload(
            path=target_filename,
            file=f,
            file_options={
                "content-type": "image/png",
                "cache-control": "3600",
                "upsert": "true" if OVERWRITE_STORAGE else "false",
            },
        )


def update_article_photo(
    supabase: Client,
    article_numero: str,
    target_filename: str,
) -> None:
    (
        supabase.table(TABLE_NAME)
        .update({PHOTO_COLUMN: target_filename})
        .eq(ARTICLE_COLUMN, article_numero)
        .execute()
    )


def write_report(results: list[MatchResult]) -> None:
    with REPORT_FILE.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(
            [
                "articles_numero",
                "photo_source",
                "articles_photo",
                "type_correspondance",
                "statut",
                "detail",
            ]
        )

        for r in results:
            writer.writerow(
                [
                    r.article_numero,
                    str(r.source_photo) if r.source_photo else "",
                    r.target_filename or "",
                    r.match_type,
                    r.status,
                    r.detail,
                ]
            )


def print_summary(results: list[MatchResult], photo_count: int) -> None:
    counts = defaultdict(int)
    for r in results:
        counts[r.status] += 1

    exact_count = sum(1 for r in results if r.match_type == "exacte")
    prefix_count = sum(1 for r in results if r.match_type == "prefixe")
    ambiguous_count = sum(1 for r in results if r.match_type == "ambigue")
    no_match_count = sum(1 for r in results if r.match_type == "aucune")

    print("\n" + "=" * 70)
    print("RESUME")
    print("=" * 70)
    print(f"Photos PNG locales          : {photo_count}")
    print(f"Articles analyses           : {len(results)}")
    print(f"Correspondances exactes     : {exact_count}")
    print(f"Correspondances par prefixe : {prefix_count}")
    print(f"Sans photo                  : {no_match_count}")
    print(f"Ambigues                    : {ambiguous_count}")

    if DRY_RUN:
        print(f"Simulation                  : OUI (aucune modification)")
    else:
        print(f"Uploads / MAJ reussis       : {counts['OK']}")
        print(f"Erreurs                     : {counts['ERREUR']}")

    print(f"\nRapport: {REPORT_FILE}")
    print("=" * 70)


def main() -> None:
    print("=" * 70)
    print("ASSOCIATION PHOTOS PRODUITS -> ARTICLES SUPABASE")
    print("=" * 70)
    print(f"Dossier photos : {PHOTOS_DIR}")
    print(f"Bucket          : {BUCKET_NAME}")
    print(f"Mode simulation : {'OUI' if DRY_RUN else 'NON'}")

    photos = load_local_photos()
    print(f"\n{len(photos)} fichier(s) PNG trouve(s).")

    if not photos:
        print("Aucune photo PNG a traiter.")
        return

    supabase = get_supabase_client()
    articles = load_articles(supabase)
    print(f"{len(articles)} article(s) charge(s) depuis Supabase.")

    exact_index = build_indexes(photos)
    results: list[MatchResult] = []

    for index, article_numero in enumerate(articles, start=1):
        photo, match_type, detail = find_photo_for_article(
            article_numero,
            photos,
            exact_index,
        )

        if photo is None:
            results.append(
                MatchResult(
                    article_numero=article_numero,
                    source_photo=None,
                    target_filename=None,
                    match_type=match_type,
                    status="IGNOREE",
                    detail=detail,
                )
            )
            continue

        target_filename = f"{article_numero}.png"

        if DRY_RUN:
            status = "SIMULATION"
            detail_final = detail
        else:
            try:
                upload_photo(
                    supabase=supabase,
                    source_path=photo.path,
                    target_filename=target_filename,
                )

                update_article_photo(
                    supabase=supabase,
                    article_numero=article_numero,
                    target_filename=target_filename,
                )

                status = "OK"
                detail_final = detail

            except Exception as exc:
                status = "ERREUR"
                detail_final = (
                    f"{detail} | {type(exc).__name__}: {exc}"
                    if detail
                    else f"{type(exc).__name__}: {exc}"
                )

        results.append(
            MatchResult(
                article_numero=article_numero,
                source_photo=photo.path,
                target_filename=target_filename,
                match_type=match_type,
                status=status,
                detail=detail_final,
            )
        )

        if index % 100 == 0:
            print(f"{index}/{len(articles)} articles analyses...")

    write_report(results)
    print_summary(results, len(photos))


if __name__ == "__main__":
    main()
