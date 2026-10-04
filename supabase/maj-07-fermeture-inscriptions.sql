-- Mise à jour 7 : les inscriptions à une ronde ferment au début du premier match de la ronde

-- Heure de fermeture = début du premier match à partir de la date de début de la ronde
create or replace function public.round_registration_closes_at(p_round bigint)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select min(g.first_game_at)
  from public.game_days g
  join public.rounds r on r.id = p_round
  where g.game_date >= r.start_date
$$;

revoke all on function public.round_registration_closes_at(bigint) from public, anon;
grant execute on function public.round_registration_closes_at(bigint) to authenticated;

create or replace function public.entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_close timestamptz;
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.is_admin) then
    raise exception 'Le compte gestionnaire ne participe pas au pool.';
  end if;

  -- Aucune inscription après le début du premier match, même par le gestionnaire
  if tg_op = 'INSERT' and auth.uid() is not null then
    v_close := public.round_registration_closes_at(new.round_id);
    if v_close is not null and now() >= v_close then
      raise exception 'Les inscriptions à cette ronde sont fermées depuis le début du premier match.';
    end if;
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
