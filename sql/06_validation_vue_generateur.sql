-- 1. Vérifier que la vue répond.
select *
from public.v_generateur_etiquettes
order by reference_ds
limit 20;

-- 2. Nombre total de références disponibles.
select count(*) as nombre_articles
from public.v_generateur_etiquettes;

-- 3. Vérifier les activités disponibles.
select distinct activite_ds
from public.v_generateur_etiquettes
where activite_ds is not null and trim(activite_ds) <> ''
order by activite_ds;

-- 4. Exemple de recherche serveur.
select reference_ds, libelle, famille, groupe, secteur
from public.v_generateur_etiquettes
where reference_ds ilike '%FU01%'
   or libelle ilike '%FU01%'
order by reference_ds
limit 50;
