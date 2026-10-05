-- Mise à jour 9 : fermeture automatique des journées
-- Points calculés automatiquement quand tous les matchs sont terminés (ou quand le
-- gestionnaire ferme la journée). Prédictions visibles jusqu'à 60 min après la fermeture.
-- Prérequis: mises à jour 3, 7 et 8 installées.

-- 1. Heure de fermeture de chaque journée
alter table public.game_days add column if not exists closed_at timestamptz;

-- 2. Le calcul des vies peut aussi être lancé par la vérification automatique
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
        where d.round_id = p_round and d.user_id = e.user_id and d.game_date < p_date and d.life_lost) >= 3 then
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
  set lives = greatest(0, 3 - (select count(*) from public.day_results d
                               where d.round_id = re.round_id and d.user_id = re.user_id and d.life_lost))
  where re.round_id = p_round;

  return n;
end $$;

-- 3. Fermer une journée: note l'heure (la première seulement) et recalcule toutes les rondes en cours
create or replace function public.close_day(p_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not (public.is_admin() or auth.uid() is null) then raise exception 'Réservé au gestionnaire.'; end if;
  update public.game_days
  set closed_at = coalesce(closed_at, now()),
      last_game_end_at = coalesce(last_game_end_at, now())
  where game_date = p_date;
  if not found then raise exception 'Aucun match enregistré pour cette date.'; end if;
  perform public.auto_start_rounds();
  for r in select * from public.rounds where status = 'en_cours' and start_date <= p_date loop
    perform public.score_day(r.id, p_date);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.close_day(date) from public, anon;
grant execute on function public.close_day(date) to authenticated, service_role;
grant execute on function public.score_day(bigint, date) to service_role;

-- 4. Prédictions visibles de +30 min après le premier match jusqu'à 60 min après la fermeture
create or replace function public.revealed_picks(p_round bigint, p_date date)
returns table (display_name text, player_name text, doublon boolean, outcome text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  g public.game_days%rowtype;
  r public.rounds%rowtype;
begin
  if auth.uid() is null then return; end if;
  select * into g from public.game_days where game_date = p_date;
  if not found then return; end if;
  select * into r from public.rounds where id = p_round;
  if not found then return; end if;

  if not (
    (public.is_admin() and now() >= g.first_game_at + interval '30 minutes')
    or r.status = 'terminee'
    or (now() >= g.first_game_at + interval '30 minutes'
        and now() < coalesce(g.closed_at, g.first_game_at + interval '12 hours') + interval '60 minutes')
  ) then
    return;
  end if;

  return query
    select coalesce(pr.nickname, pr.first_name)::text,
           pl.full_name::text,
           (not p.is_default and exists (
              select 1 from public.picks p2
              where p2.round_id = p.round_id and p2.user_id = p.user_id and p2.player_id = p.player_id
                and p2.game_date < p.game_date and not p2.is_default)),
           d.outcome::text
    from public.picks p
    join public.profiles pr on pr.id = p.user_id
    join public.players pl on pl.id = p.player_id
    left join public.day_results d on d.round_id = p.round_id and d.user_id = p.user_id and d.game_date = p.game_date
    where p.round_id = p_round and p.game_date = p_date
    order by 1;
end $$;

-- 5. Vérification automatique toutes les 10 minutes
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'fermer-journees';
select cron.schedule(
  'fermer-journees',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://survivor-pool-hockey.vercel.app/api/cron/fermer-journees',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'abCTd2-10Y31yjWHmdLty5iNQXa_hMcR'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

select 'Mise à jour 9 installée' as resultat;
