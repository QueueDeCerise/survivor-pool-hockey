-- Mise à jour 8 : une ronde passe automatiquement de « Inscriptions » à « En cours »
-- au début de son premier match, sans intervention du gestionnaire.
-- Prérequis: la mise à jour 7 doit déjà être installée.

-- 1. Planificateur de tâches de Supabase
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- 2. Démarre les rondes dont le premier match est commencé
create or replace function public.auto_start_rounds()
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update public.rounds r
  set status = 'en_cours'
  where r.status = 'inscriptions'
    and public.round_registration_closes_at(r.id) is not null
    and now() >= public.round_registration_closes_at(r.id);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.auto_start_rounds() from public, anon, authenticated;

-- 3. Vérification chaque minute
select cron.unschedule(jobid) from cron.job where jobname = 'demarrer-rondes';
select cron.schedule('demarrer-rondes', '* * * * *', $$ select public.auto_start_rounds(); $$);

-- 4. Rattrapage immédiat des rondes déjà commencées
select public.auto_start_rounds() as rondes_demarrees;
