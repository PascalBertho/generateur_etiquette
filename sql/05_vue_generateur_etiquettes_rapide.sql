-- Vue dédiée au générateur d'étiquettes.
-- Une ligne par article. Le premier code-barres disponible est retenu.

create extension if not exists pg_trgm;

-- Index de jointure / filtrage
create index if not exists idx_articles_famille
  on public.articles (articles_famille);

create index if not exists idx_articles_numero
  on public.articles (articles_numero);

create index if not exists idx_familles_famille
  on public.familles (famille);

create index if not exists idx_familles_activite_groupe
  on public.familles (activite_ds, groupe);

create index if not exists idx_ds_code_barre_ref_ds
  on public.ds_code_barre (ref_ds);

create index if not exists idx_correspondance_activite_ds
  on public.correspondance (activite_ds);

-- Index destinés à la recherche partielle (ILIKE '%texte%')
create index if not exists idx_articles_nomfr_trgm
  on public.articles using gin (articles_nomfr gin_trgm_ops);

create index if not exists idx_articles_numero_trgm
  on public.articles using gin ((articles_numero::text) gin_trgm_ops);

create index if not exists idx_ds_code_barre_ref_fournisseur_trgm
  on public.ds_code_barre using gin ((ref_fournisseur::text) gin_trgm_ops);

create index if not exists idx_ds_code_barre_code_barre_trgm
  on public.ds_code_barre using gin ((code_barre::text) gin_trgm_ops);

-- La vue évite de refaire les jointures dans l'API à chaque requête.
create or replace view public.v_generateur_etiquettes as
select
  a.articles_numero::text                        as reference_ds,
  cb.ref_fournisseur::text                       as reference_fournisseur,
  f.activite_ds::text                            as activite_ds,
  f.groupe::text                                 as groupe,
  a.articles_famille::text                       as famille,
  a.articles_nomfr::text                         as libelle,
  coalesce(c.secteur::text, f.activite_ds::text) as secteur,
  a.articles_prix_vente                          as prix,
  cb.code_barre::text                            as code_barre,
  cb.type_code_barre::text                       as type_code_barre,
  a.articles_photo::text                         as articles_photo
from public.articles a
left join public.familles f
  on f.famille::text = a.articles_famille::text
left join lateral (
  select
    d.ref_fournisseur,
    d.code_barre,
    d.type_code_barre
  from public.ds_code_barre d
  where d.ref_ds::text = a.articles_numero::text
  order by
    case when nullif(trim(d.code_barre::text), '') is null then 1 else 0 end,
    d.id asc
  limit 1
) cb on true
left join lateral (
  select x.secteur
  from public.correspondance x
  where lower(trim(x.activite_ds::text)) = lower(trim(f.activite_ds::text))
  order by x.id asc
  limit 1
) c on true;

-- Rafraîchit le cache de schéma PostgREST après création/remplacement de la vue.
notify pgrst, 'reload schema';
