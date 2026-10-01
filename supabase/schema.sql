-- =====================================================================
-- Survivor Pool Hockey : schéma Supabase (PostgreSQL)
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  nickname text,
  nickname_changes int not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rule_acceptances (
  user_id uuid not null references public.profiles(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

create table if not exists public.rounds (
  id bigint generated always as identity primary key,
  number int not null unique,
  start_date date not null,
  status text not null default 'inscriptions' check (status in ('inscriptions', 'en_cours', 'terminee')),
  fee numeric(8,2) not null default 10,
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.round_entries (
  round_id bigint not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  paid boolean not null default false,
  paid_at timestamptz,
  lives int not null default 3,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table if not exists public.game_days (
  game_date date primary key,
  first_game_at timestamptz not null,
  last_game_end_at timestamptz,
  games jsonb not null default '[]'::jsonb
);

create table if not exists public.players (
  id bigint generated always as identity primary key,
  nhl_id bigint unique,
  full_name text not null,
  position text,
  approved boolean not null default false,
  is_default boolean not null default false,
  proposed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists players_name_idx on public.players (lower(full_name));

create table if not exists public.point_events (
  player_id bigint not null references public.players(id) on delete cascade,
  game_date date not null,
  goals int not null default 0 check (goals >= 0),
  assists int not null default 0 check (assists >= 0),
  source text not null default 'manuel',
  updated_at timestamptz not null default now(),
  primary key (player_id, game_date)
);

create table if not exists public.picks (
  id bigint generated always as identity primary key,
  round_id bigint not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_date date not null references public.game_days(game_date),
  player_id bigint not null references public.players(id),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, user_id, game_date)
);

create table if not exists public.day_results (
  round_id bigint not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_date date not null,
  player_id bigint references public.players(id),
  points int not null default 0,
  outcome text not null check (outcome in ('survie', 'sans_point', 'doublon', 'aucun_choix')),
  life_lost boolean not null,
  computed_at timestamptz not null default now(),
  primary key (round_id, user_id, game_date)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  action text not null,
  row_data jsonb,
  old_data jsonb
);

-- Joueur par défaut appliqué quand aucun choix n'est fait
insert into public.players (full_name, position, approved, is_default)
select 'TARO TSUJIMOTO', 'C', true, true
where not exists (select 1 from public.players where is_default);

-- ---------- Fonctions utilitaires ------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, nickname)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), 'Participant'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'last_name'), ''), ''),
    nullif(trim(new.raw_user_meta_data->>'nickname'), '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Protection du profil: limite de 2 changements de surnom, rôle admin verrouillé
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.first_name := old.first_name;
    new.last_name := old.last_name;
    new.nickname_changes := old.nickname_changes;
    new.nickname := nullif(trim(new.nickname), '');
    if new.nickname is distinct from old.nickname then
      if old.nickname_changes >= 2 then
        raise exception 'Limite de 2 changements de surnom atteinte.';
      end if;
      new.nickname_changes := old.nickname_changes + 1;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Inscription à une ronde: le participant ne peut pas se marquer payé
create or replace function public.entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

drop trigger if exists entries_guard on public.round_entries;
create trigger entries_guard before insert or update on public.round_entries
  for each row execute function public.entries_guard();

-- Proposition de joueur: toujours bloqué jusqu'à validation
create or replace function public.players_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.full_name := regexp_replace(trim(new.full_name), '\s+', ' ', 'g');
  if length(new.full_name) < 3 then raise exception 'Entre le nom complet du joueur.'; end if;
  if exists (select 1 from public.players p where lower(p.full_name) = lower(new.full_name)) then
    raise exception 'Ce joueur est déjà dans la liste ou déjà proposé.';
  end if;
  new.approved := false;
  new.is_default := false;
  new.nhl_id := null;
  new.proposed_by := auth.uid();
  return new;
end $$;

drop trigger if exists players_guard on public.players;
create trigger players_guard before insert on public.players
  for each row execute function public.players_guard();

-- Validation des choix: heure limite, joueur validé, participant en vie
create or replace function public.picks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_first timestamptz;
  v_round public.rounds%rowtype;
  v_entry public.round_entries%rowtype;
  v_player public.players%rowtype;
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then return new; end if;

  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.round_id <> old.round_id or new.game_date <> old.game_date) then
    raise exception 'Modification invalide.';
  end if;
  if new.user_id <> auth.uid() then raise exception 'Action non autorisée.'; end if;
  new.is_default := false;

  select * into v_round from public.rounds where id = new.round_id;
  if not found or v_round.status = 'terminee' then raise exception 'Cette ronde est terminée.'; end if;
  if new.game_date < v_round.start_date then raise exception 'Cette date précède le début de la ronde.'; end if;

  select * into v_entry from public.round_entries where round_id = new.round_id and user_id = new.user_id;
  if not found then raise exception 'Tu n''es pas inscrit à cette ronde.'; end if;
  if v_entry.lives <= 0 then raise exception 'Tu es éliminé de cette ronde.'; end if;

  select g.first_game_at into v_first from public.game_days g where g.game_date = new.game_date;
  if v_first is null then raise exception 'Aucun match prévu cette journée.'; end if;

  if tg_op = 'UPDATE' and now() >= v_first then
    raise exception 'Les modifications sont verrouillées depuis le début du premier match.';
  end if;
  if now() >= v_first + interval '30 minutes' then
    raise exception 'La période de sélection est terminée pour cette journée.';
  end if;

  select * into v_player from public.players where id = new.player_id;
  if not found or not v_player.approved or v_player.is_default then
    raise exception 'Ce joueur n''est pas encore sélectionnable.';
  end if;
  if now() >= v_first and exists (
    select 1 from public.point_events pe
    where pe.player_id = new.player_id and pe.game_date = new.game_date and pe.goals + pe.assists > 0
  ) then
    raise exception 'Ce joueur a déjà obtenu un point aujourd''hui.';
  end if;
  return new;
end $$;

drop trigger if exists picks_guard on public.picks;
create trigger picks_guard before insert or update on public.picks
  for each row execute function public.picks_guard();

-- Journal d'audit
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, table_name, action, row_data, old_data)
  values (
    auth.uid(), tg_table_name, tg_op,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'rounds', 'round_entries', 'players', 'point_events', 'picks'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- ---------- Fonctions appelées par l'application ---------------------

-- Classement public (surnoms et vies seulement)
create or replace function public.standings(p_round bigint)
returns table (display_name text, lives int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(pr.nickname, pr.first_name), re.lives, re.user_id = auth.uid()
  from public.round_entries re
  join public.profiles pr on pr.id = re.user_id
  where re.round_id = p_round and auth.uid() is not null
  order by re.lives desc, 1
$$;

-- Cagnotte = inscriptions payées x frais
create or replace function public.round_pot(p_round bigint)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(count(*) filter (where re.paid), 0) * max(r.fee)
  from public.rounds r
  left join public.round_entries re on re.round_id = r.id
  where r.id = p_round and auth.uid() is not null
$$;

-- Révélation: seulement pendant la fenêtre officielle ou après la ronde
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
    public.is_admin()
    or r.status = 'terminee'
    or (now() >= g.first_game_at + interval '30 minutes'
        and now() < coalesce(g.last_game_end_at, g.first_game_at + interval '6 hours') + interval '90 minutes')
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

-- Liste privée des participants (courriels) pour le gestionnaire
create or replace function public.admin_participants()
returns table (id uuid, first_name text, last_name text, nickname text, email text, created_at timestamptz, rules_version text)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Réservé au gestionnaire.'; end if;
  return query
    select p.id, p.first_name, p.last_name, p.nickname, u.email::text, p.created_at,
           (select max(ra.version) from public.rule_acceptances ra where ra.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.first_name, p.last_name;
end $$;

-- Calcul des vies d'une journée (idempotent: peut être relancé après correction)
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
  if not public.is_admin() then raise exception 'Réservé au gestionnaire.'; end if;
  select * into v_round from public.rounds where id = p_round;
  if not found then raise exception 'Ronde introuvable.'; end if;
  if p_date < v_round.start_date then raise exception 'Cette date précède le début de la ronde.'; end if;
  if not exists (select 1 from public.game_days where game_date = p_date) then
    raise exception 'Aucun match enregistré pour cette date.';
  end if;
  select id into v_taro from public.players where is_default limit 1;

  delete from public.day_results where round_id = p_round and game_date = p_date;

  for e in select * from public.round_entries where round_id = p_round loop
    -- déjà éliminé avant cette journée?
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

revoke all on function public.standings(bigint) from public, anon;
revoke all on function public.round_pot(bigint) from public, anon;
revoke all on function public.revealed_picks(bigint, date) from public, anon;
revoke all on function public.admin_participants() from public, anon;
revoke all on function public.score_day(bigint, date) from public, anon;
grant execute on function public.standings(bigint) to authenticated;
grant execute on function public.round_pot(bigint) to authenticated;
grant execute on function public.revealed_picks(bigint, date) to authenticated;
grant execute on function public.admin_participants() to authenticated;
grant execute on function public.score_day(bigint, date) to authenticated;

-- ---------- Sécurité par ligne (RLS) ----------------------------------

alter table public.profiles enable row level security;
alter table public.rule_acceptances enable row level security;
alter table public.rounds enable row level security;
alter table public.round_entries enable row level security;
alter table public.game_days enable row level security;
alter table public.players enable row level security;
alter table public.point_events enable row level security;
alter table public.picks enable row level security;
alter table public.day_results enable row level security;
alter table public.audit_log enable row level security;

-- profils: chacun voit le sien, le gestionnaire voit tout
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists rules_select on public.rule_acceptances;
create policy rules_select on public.rule_acceptances for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists rules_insert on public.rule_acceptances;
create policy rules_insert on public.rule_acceptances for insert to authenticated with check (user_id = auth.uid());

drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds for select to authenticated using (true);
drop policy if exists rounds_admin on public.rounds;
create policy rounds_admin on public.rounds for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists entries_select on public.round_entries;
create policy entries_select on public.round_entries for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists entries_insert on public.round_entries;
create policy entries_insert on public.round_entries for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
drop policy if exists entries_admin_update on public.round_entries;
create policy entries_admin_update on public.round_entries for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists entries_admin_delete on public.round_entries;
create policy entries_admin_delete on public.round_entries for delete to authenticated using (public.is_admin());

drop policy if exists days_select on public.game_days;
create policy days_select on public.game_days for select to authenticated using (true);
drop policy if exists days_admin on public.game_days;
create policy days_admin on public.game_days for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists players_select on public.players;
create policy players_select on public.players for select to authenticated using (approved or proposed_by = auth.uid() or public.is_admin());
drop policy if exists players_insert on public.players;
create policy players_insert on public.players for insert to authenticated with check (true);
drop policy if exists players_admin_update on public.players;
create policy players_admin_update on public.players for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists players_admin_delete on public.players;
create policy players_admin_delete on public.players for delete to authenticated using (public.is_admin());

drop policy if exists points_select on public.point_events;
create policy points_select on public.point_events for select to authenticated using (true);
drop policy if exists points_admin on public.point_events;
create policy points_admin on public.point_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists picks_select on public.picks;
create policy picks_select on public.picks for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists picks_insert on public.picks;
create policy picks_insert on public.picks for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
drop policy if exists picks_update on public.picks;
create policy picks_update on public.picks for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists picks_delete on public.picks;
create policy picks_delete on public.picks for delete to authenticated using (
  public.is_admin()
  or (user_id = auth.uid() and now() < (select g.first_game_at from public.game_days g where g.game_date = picks.game_date))
);

drop policy if exists results_select on public.day_results;
create policy results_select on public.day_results for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists results_admin on public.day_results;
create policy results_admin on public.day_results for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated using (public.is_admin());

-- =====================================================================
-- APRÈS ta propre inscription dans l'application, exécute ceci pour
-- devenir gestionnaire (remplace le courriel au besoin):
--
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'mbeliveau@mbsf.ca');
-- =====================================================================
