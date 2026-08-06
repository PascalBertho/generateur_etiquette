-- 02_create_view_articles_etiquettes.sql
-- Hypotheses a verifier dans DS_Sales :
--   public.articles : articles_numero, articles_famille, articles_nomfr, articles_prix_vente
--   public.familles : famille, activite_ds, groupe
-- Si le nom exact de la colonne groupe differe, remplacez f.groupe ci-dessous.

create or replace view public.v_articles_etiquettes as
select
    a.articles_numero::text                              as ref_ds,
    dcb.ref_fournisseur                                  as ref_fournisseur,
    dcb.type_code_barre                                  as type_code_barre,
    dcb.code_barre                                       as code_barre,
    a.articles_famille::text                             as famille,
    f.groupe::text                                       as groupe,
    f.activite_ds::text                                  as activite_ds,
    dcb.groupe_articles                                  as groupe_articles_code_barre,
    c.secteur                                            as secteur_correspondance,
    case
        when nullif(trim(dcb.code_barre), '') is not null
             and nullif(trim(c.secteur), '') is not null
             and trim(c.secteur) <> '--'
          then c.secteur
        else f.activite_ds::text
    end                                                   as secteur,
    a.articles_nomfr::text                               as libelle,
    a.articles_prix_vente                                as prix_pvp_htva,
    dcb.code_remise                                      as code_remise,
    dcb.id                                               as ds_code_barre_id
from public.articles a
left join public.familles f
    on trim(f.famille::text) = trim(a.articles_famille::text)
left join public.ds_code_barre dcb
    on trim(dcb.ref_ds) = trim(a.articles_numero::text)
left join public.correspondance c
    on trim(c.activite_ds) = trim(f.activite_ds::text)
   and (
       nullif(trim(dcb.groupe_articles), '') is null
       or trim(c.groupe_articles) = trim(dcb.groupe_articles)
   );

comment on view public.v_articles_etiquettes is
'Vue unifiee pour le generateur : articles + familles + codes-barres + correspondance secteur.';
