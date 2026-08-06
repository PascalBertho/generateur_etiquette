-- Contrôles à exécuter après création de la vue.

select count(*) as lignes_vue
from public.v_articles_etiquettes;

select secteur, count(*) as nombre
from public.v_articles_etiquettes
group by secteur
order by secteur;

select secteur, groupe, count(*) as nombre
from public.v_articles_etiquettes
group by secteur, groupe
order by secteur, groupe;

select
  count(*) filter (where code_barre is not null and trim(code_barre) <> '') as avec_code_barre,
  count(*) filter (where code_barre is null or trim(code_barre) = '') as sans_code_barre,
  count(*) filter (where secteur is null or trim(secteur) = '') as sans_secteur,
  count(*) filter (where groupe is null or trim(groupe) = '') as sans_groupe
from public.v_articles_etiquettes;

select ref_ds, count(*) as nombre_codes
from public.v_articles_etiquettes
where code_barre is not null and trim(code_barre) <> ''
group by ref_ds
having count(*) > 1
order by nombre_codes desc, ref_ds
limit 50;
