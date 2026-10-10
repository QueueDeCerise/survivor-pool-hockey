-- Mise à jour 15 : « gestionnaire » devient « commissaire » dans les messages de la base de données
-- Réécrit automatiquement chaque fonction du pool qui contient le mot, sans rien changer d'autre.

do $$
declare
  f record;
  v_def text;
  n int := 0;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%gestionnaire%'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_def := replace(replace(v_def, 'gestionnaire', 'commissaire'), 'Gestionnaire', 'Commissaire');
    execute v_def;
    n := n + 1;
  end loop;
  raise notice '% fonction(s) mise(s) à jour', n;
end $$;

-- Vérification: doit afficher 0
select count(*) as fonctions_avec_gestionnaire
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ilike '%gestionnaire%';
