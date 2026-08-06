-- 03_requetes_validation.sql

-- Nombre de lignes importees
select count(*) as correspondances from public.correspondance;
select count(*) as codes_barres from public.ds_code_barre;

-- References DS avec plusieurs codes-barres
select ref_ds, count(*) as nombre_codes
from public.ds_code_barre
group by ref_ds
having count(*) > 1
order by nombre_codes desc, ref_ds;

-- Codes-barres EAN13 ne comportant pas exactement 13 chiffres
select id, ref_ds, code_barre, type_code_barre
from public.ds_code_barre
where type_code_barre = 'EAN13'
  and code_barre !~ '^[0-9]{13}$';

-- References du fichier sans correspondance dans articles
select d.ref_ds, count(*) as nombre_codes
from public.ds_code_barre d
left join public.articles a
  on trim(a.articles_numero::text) = trim(d.ref_ds)
where a.articles_numero is null
group by d.ref_ds
order by d.ref_ds;

-- Familles sans correspondance dans la table familles
select distinct a.articles_famille
from public.articles a
left join public.familles f
  on trim(f.famille::text) = trim(a.articles_famille::text)
where f.famille is null
order by a.articles_famille;

-- Apercu final
select *
from public.v_articles_etiquettes
order by secteur, groupe, libelle
limit 100;
