-- 1. Les secteurs attendus dans le premier menu.
select distinct trim(secteur) as secteur
from public.correspondance
where nullif(trim(secteur), '') is not null
  and trim(secteur) <> '--'
order by 1;

-- Résultat attendu :
-- Accumulateur thermique
-- Cheminées
-- Equipement
-- Pompe à chaleur et climatisation
-- Traitement d'eau
-- Ventilation

-- 2. Répartition des articles de la vue par secteur.
select secteur, count(*) as nombre_lignes
from public.v_articles_etiquettes
group by secteur
order by secteur;

-- 3. Activités DS non traduites en libellé secteur.
select activite_ds, count(*) as nombre_lignes
from public.v_articles_etiquettes
where secteur = activite_ds
   or secteur is null
   or trim(secteur) = ''
group by activite_ds
order by activite_ds;
