-- Mise à jour 14 : égalité en fin de ronde (partage unanime ou prolongation de 5 jours)
-- Prérequis: mises à jour 9 à 13 installées.

-- 1. Nouvelles informations
alter table public.rounds add column if not exists tie_status text check (tie_status in ('decision', 'prolongation', 'partage'));
alter table public.rounds add column if not exists tie_date date;
alter table public.rounds add column if not exists overtime_start date;
alter table public.round_entries add column if not exists bonus_lives int not null default 0;
alter table public.round_entries add column if not exists finalist boolean not null default false;
alter table public.round_entries add column if not exists winner boolean not null default false;

-- Gagnant déjà enregistré (ronde 2)
update public.round_entries re set winner = true
from public.rounds r
where r.id = re.round_id and r.winner_id = re.user_id;

-- 2. Inscription: un participant ne peut pas modifier ces nouvelles informations
create or replace function public.entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_close timestamptz;
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.is_admin) then
    raise exception 'Le compte gestionnaire ne participe pas au pool.';
  end if;
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
  new.bonus_lives := 0;
  new.finalist := false;
  new.winner := false;
  return new;
end $$;

-- 3. Calcul des vies: tient compte de la vie donnée en prolongation
create or replace function public.score_day(p_round bigint, p_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_pick public.picks%rowtype;
  v_round public.rounds%rowtype;
  v_taro bigint;
  v_pts int;
  v_dup boolean;
  n int := 0;
begin
  if not (public.is_admin() or auth.uid() is null) then raise exception 'Réservé au gestionnaire.'; end if;
  select * into v_round from public.rounds where id = p_round;
  if not found then raise exception 'Ronde introuvable.'; end if;
  if p_date < v_round.start_date then raise exception 'Cette date précède le début de la ronde.'; end if;
  if not exists (select 1 from public.game_days where game_date = p_date) then
    raise exception 'Aucun match enregistré pour cette date.';
  end if;
  select id into v_taro from public.players where is_default limit 1;

  delete from public.day_results where round_id = p_round and game_date = p_date;

  for e in select * from public.round_entries where round_id = p_round loop
    if (select count(*) from public.day_results d
        where d.round_id = p_round and d.user_id = e.user_id and d.game_date < p_date and d.life_lost) >= 3 + e.bonus_lives then
      continue;
    end if;

    select * into v_pick from public.picks where round_id = p_round and user_id = e.user_id and game_date = p_date;
    if not found then
      insert into public.picks (round_id, user_id, game_date, player_id, is_default)
      values (p_round, e.user_id, p_date, v_taro, true)
      returning * into v_pick;
    end if;

    select coalesce(pe.goals + pe.assists, 0) into v_pts
    from public.point_events pe where pe.player_id = v_pick.player_id and pe.game_date = p_date;
    v_pts := coalesce(v_pts, 0);

    v_dup := (not v_pick.is_default) and exists (
      select 1 from public.picks p
      where p.round_id = p_round and p.user_id = e.user_id and p.player_id = v_pick.player_id
        and p.game_date < p_date and not p.is_default);

    insert into public.day_results (round_id, user_id, game_date, player_id, points, outcome, life_lost)
    values (
      p_round, e.user_id, p_date, v_pick.player_id, v_pts,
      case when v_pick.is_default then 'aucun_choix' when v_dup then 'doublon' when v_pts = 0 then 'sans_point' else 'survie' end,
      v_pick.is_default or v_dup or v_pts = 0
    );
    n := n + 1;
  end loop;

  update public.round_entries re
  set lives = greatest(0, 3 + re.bonus_lives - (select count(*) from public.day_results d
                                                where d.round_id = re.round_id and d.user_id = re.user_id and d.life_lost))
  where re.round_id = p_round;

  return n;
end $$;

revoke execute on function public.score_day(bigint, date) from authenticated;

-- 4. Fin de ronde: gagnant unique, égalité, prolongation ou partage
create or replace function public.finalize_rounds()
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int;
  v_alive int;
  v_last date;
  v_fin int;
  v_ot_days int;
  n int := 0;
begin
  for r in select * from public.rounds where status = 'en_cours' loop
    select count(*) into v_total from public.round_entries where round_id = r.id;
    if v_total < 2 then continue; end if;
    select count(*) into v_alive from public.round_entries where round_id = r.id and lives > 0;

    -- Un seul survivant: il gagne
    if v_alive = 1 then
      update public.round_entries set winner = (lives > 0) where round_id = r.id;
      update public.rounds set status = 'terminee', finished_at = now(),
        winner_id = (select user_id from public.round_entries where round_id = r.id and lives > 0 limit 1)
      where id = r.id;
      n := n + 1;
      continue;
    end if;

    -- Plus personne en vie: les derniers à avoir perdu leur vie sont les finalistes
    if v_alive = 0 then
      if r.tie_status = 'decision' then continue; end if;
      select max(game_date) into v_last from public.day_results where round_id = r.id;
      if v_last is null then continue; end if;
      update public.round_entries re
      set finalist = exists (select 1 from public.day_results d
                             where d.round_id = r.id and d.user_id = re.user_id and d.game_date = v_last and d.life_lost)
      where re.round_id = r.id;
      select count(*) into v_fin from public.round_entries where round_id = r.id and finalist;

      if v_fin = 1 then
        update public.round_entries set winner = finalist where round_id = r.id;
        update public.rounds set status = 'terminee', finished_at = now(),
          winner_id = (select user_id from public.round_entries where round_id = r.id and finalist limit 1)
        where id = r.id;
      elsif r.tie_status = 'prolongation' then
        -- Tous tombés le même jour en prolongation: partage
        update public.round_entries set winner = finalist where round_id = r.id;
        update public.rounds set status = 'terminee', finished_at = now(), tie_status = 'partage', winner_id = null where id = r.id;
      else
        -- Fin du temps réglementaire: décision à prendre (partage unanime ou prolongation)
        update public.rounds set tie_status = 'decision', tie_date = v_last where id = r.id;
      end if;
      n := n + 1;
      continue;
    end if;

    -- Prolongation: maximum 5 jours, ensuite partage entre les survivants
    if r.tie_status = 'prolongation' and r.overtime_start is not null then
      select count(distinct game_date) into v_ot_days
      from public.day_results where round_id = r.id and game_date >= r.overtime_start;
      if v_ot_days >= 5 then
        update public.round_entries set winner = (lives > 0) where round_id = r.id;
        update public.rounds set status = 'terminee', finished_at = now(), tie_status = 'partage', winner_id = null where id = r.id;
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.finalize_rounds() from public, anon, authenticated;

-- 5. Décision du gestionnaire après le choix des finalistes (irrévocable)
create or replace function public.resolve_tie(p_round bigint, p_choice text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds%rowtype;
  v_start date;
begin
  if not public.is_admin() then raise exception 'Réservé au gestionnaire.'; end if;
  select * into r from public.rounds where id = p_round for update;
  if not found then raise exception 'Ronde introuvable.'; end if;
  if r.tie_status is distinct from 'decision' then
    raise exception 'Aucune décision en attente pour cette ronde. Le choix est irrévocable.';
  end if;

  if p_choice = 'partage' then
    update public.round_entries set winner = finalist where round_id = p_round;
    update public.rounds set status = 'terminee', finished_at = now(), tie_status = 'partage', winner_id = null where id = p_round;
    return 'partage';
  elsif p_choice = 'prolongation' then
    select min(g.game_date) into v_start
    from public.game_days g
    where g.game_date > r.tie_date and g.first_game_at > now();
    update public.round_entries set bonus_lives = bonus_lives + 1, lives = 1 where round_id = p_round and finalist;
    update public.rounds set tie_status = 'prolongation', overtime_start = coalesce(v_start, r.tie_date + 1) where id = p_round;
    return 'prolongation';
  else
    raise exception 'Choix invalide.';
  end if;
end $$;

revoke all on function public.resolve_tie(bigint, text) from public, anon;
grant execute on function public.resolve_tie(bigint, text) to authenticated;

-- 6. État d'égalité visible par les participants
create or replace function public.round_tie(p_round bigint)
returns table (tie_status text, overtime_day int, overtime_start date, finalists text)
language sql stable security definer set search_path = public as $$
  select r.tie_status,
         (select count(distinct d.game_date)::int from public.day_results d
          where d.round_id = r.id and r.overtime_start is not null and d.game_date >= r.overtime_start),
         r.overtime_start,
         (select string_agg(coalesce(p.nickname, p.first_name), ' · ' order by coalesce(p.nickname, p.first_name))
          from public.round_entries re join public.profiles p on p.id = re.user_id
          where re.round_id = r.id and re.finalist)
  from public.rounds r
  where r.id = p_round and auth.uid() is not null
$$;

revoke all on function public.round_tie(bigint) from public, anon;
grant execute on function public.round_tie(bigint) to authenticated;

-- 7. Champions: un seul gagnant ou plusieurs (partage)
drop function if exists public.round_champions();
create function public.round_champions()
returns table (round_id bigint, round_number int, display_name text, winners int, pot numeric, share numeric, finished_at timestamptz, tie_status text)
language sql stable security definer set search_path = public as $$
  select r.id, r.number,
         string_agg(coalesce(p.nickname, p.first_name), ' · ' order by coalesce(p.nickname, p.first_name))::text,
         count(*)::int,
         (select count(*) from public.round_entries x where x.round_id = r.id and x.paid) * r.fee,
         floor((select count(*) from public.round_entries x where x.round_id = r.id and x.paid) * r.fee * 100 / count(*)) / 100,
         r.finished_at,
         r.tie_status
  from public.rounds r
  join public.round_entries re on re.round_id = r.id and (re.winner or re.user_id = r.winner_id)
  join public.profiles p on p.id = re.user_id
  where r.status = 'terminee' and auth.uid() is not null
  group by r.id
  order by r.finished_at desc nulls last, r.number desc
$$;

revoke all on function public.round_champions() from public, anon;
grant execute on function public.round_champions() to authenticated;

select 'Mise à jour 14 installée' as resultat;
