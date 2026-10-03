-- Mise à jour 1 : compte gestionnaire séparé, qui ne participe pas au pool
-- AVANT D'EXÉCUTER: remplace COURRIEL_GESTIONNAIRE (2 fois plus bas) par le courriel du compte gestionnaire.

-- 1. Un compte gestionnaire ne peut jamais être inscrit à une ronde
create or replace function public.entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.is_admin) then
    raise exception 'Le compte gestionnaire ne participe pas au pool.';
  end if;
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'UPDATE' and new.paid and not old.paid then new.paid_at := now(); end if;
    if tg_op = 'UPDATE' and not new.paid then new.paid_at := null; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Seul le gestionnaire peut modifier une inscription.';
  end if;
  if (select r.status from public.rounds r where r.id = new.round_id) is distinct from 'inscriptions' then
    raise exception 'Les inscriptions à cette ronde sont fermées.';
  end if;
  new.user_id := auth.uid();
  new.paid := false;
  new.paid_at := null;
  new.lives := 3;
  return new;
end $$;

-- 2. Retirer le rôle gestionnaire à tous les comptes
update public.profiles set is_admin = false where is_admin;

-- 3. Donner le rôle au seul compte gestionnaire
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'COURRIEL_GESTIONNAIRE');

-- 4. Le gestionnaire ne participe à aucune ronde
delete from public.day_results where user_id in (select id from public.profiles where is_admin);
delete from public.picks where user_id in (select id from public.profiles where is_admin);
delete from public.round_entries where user_id in (select id from public.profiles where is_admin);

-- 5. Vérification : une seule ligne doit afficher is_admin = true
select u.email, p.first_name, p.nickname, p.is_admin
from public.profiles p join auth.users u on u.id = p.id
order by p.is_admin desc, u.email;
