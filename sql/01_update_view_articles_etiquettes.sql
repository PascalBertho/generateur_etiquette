-- Vue utilisée par l'application generateur_etiquettes.
-- Pré-requis : tables public.articles, public.familles,
-- public.ds_code_barre et public.correspondance.
-- Vérifiez que la colonne du groupe dans public.familles s'appelle bien "groupe".

create or replace view public.v_articles_etiquettes as
with correspondance_activite as (
    -- Une activité peut apparaître plusieurs fois dans Correspondance
    -- (par exemple Equipement), mais son libellé secteur est identique.
    select
        trim(activite_ds::text) as activite_ds,
        max(nullif(trim(secteur::text), '--')) as secteur
    from public.correspondance
    group by trim(activite_ds::text)
)
select
    a.articles_numero::text                 as ref_ds,
    dcb.ref_fournisseur                     as ref_fournisseur,
    dcb.type_code_barre                     as type_code_barre,
    dcb.code_barre                          as code_barre,
    a.articles_famille::text                as famille,
    f.groupe::text                          as groupe,
    f.activite_ds::text                     as activite_ds,
    dcb.groupe_articles                     as groupe_articles_code_barre,
    c_code.secteur                          as secteur_correspondance,
    case
        -- Si un code-barres existe, le secteur est déterminé par
        -- Activité DS + Groupe d'articles de DS_code_barre.
        when nullif(trim(dcb.code_barre), '') is not null
         and nullif(trim(c_code.secteur), '') is not null
         and trim(c_code.secteur) <> '--'
            then trim(c_code.secteur)
        -- Sans code-barres (ou sans correspondance de groupe), on traduit
        -- activite_ds via la table Correspondance.
        when nullif(trim(c_activite.secteur), '') is not null
            then trim(c_activite.secteur)
        -- Dernier secours pour identifier les données encore non mappées.
        else trim(f.activite_ds::text)
    end                                      as secteur,
    a.articles_nomfr::text                  as libelle,
    a.articles_prix_vente                   as prix_pvp_htva,
    dcb.code_remise                         as code_remise,
    dcb.id                                  as ds_code_barre_id
from public.articles a
left join public.familles f
    on trim(f.famille::text) = trim(a.articles_famille::text)
left join public.ds_code_barre dcb
    on trim(dcb.ref_ds) = trim(a.articles_numero::text)
left join public.correspondance c_code
    on trim(c_code.activite_ds::text) = trim(f.activite_ds::text)
   and trim(coalesce(c_code.groupe_articles::text, '')) = trim(coalesce(dcb.groupe_articles::text, ''))
left join correspondance_activite c_activite
    on c_activite.activite_ds = trim(f.activite_ds::text);

comment on view public.v_articles_etiquettes is
'Vue unifiée : articles + familles + DS_code_barre + correspondance, destinée au générateur d’étiquettes.';

grant select on public.v_articles_etiquettes to service_role;
