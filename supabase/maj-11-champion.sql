-- Mise à jour 11 : gagnant de la ronde
-- Quand il ne reste qu'un seul survivant, la ronde se termine et son gagnant est enregistré.
-- Prérequis: mises à jour 9 et 10 installées.

alter table public.rounds add column if not exists finished_at timestamptz;

-- 1. Termine les rondes où il ne reste qu'un seul participant en vie
create or replace function public.finalize_rounds()
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_alive int;
  v_total int;
  v_winner uuid;
  n int := 0;
begin
  for r in select * from public.rounds where status = 'en_cours' and winner_id is null loop
    select count(*) into v_total from public.round_entries where round_id = r.id;
    select count(*), (array_agg(re.user_id))[1] into v_alive, v_winner
    from public.round_entries re where re.round_id = r.id and re.lives > 0;
    if v_total > 1 and v_alive = 1 then
      update public.rounds set winner_id = v_winner, status = 'terminee', finished_at = now() where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.finalize_rounds() from public, anon, authenticated;

-- 2. La fermeture d'une journée vérifie maintenant s'il y a un gagnant
create or replace function public.close_day(p_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  g public.game_days%rowtype;
  n int := 0;
begin
  if not (public.is_admin() or auth.uid() is null) then raise exception 'Réservé au gestionnaire.'; end if;
  select * into g from public.game_days where game_date = p_date;
  if not found then raise exception 'Aucun match enregistré pour cette date.'; end if;
  if now() < g.first_game_at + interval '30 minutes' then
    raise exception 'Impossible de fermer cette journée: les matchs ne sont pas encore commencés.';
  end if;
  update public.game_days
  set closed_at = coalesce(closed_at, now()),
      last_game_end_at = coalesce(last_game_end_at, now())
  where game_date = p_date;
  perform public.auto_start_rounds();
  for r in select * from public.rounds where status = 'en_cours' and start_date <= p_date loop
    perform public.score_day(r.id, p_date);
    n := n + 1;
  end loop;
  perform public.finalize_rounds();
  return n;
end $$;

-- 3. Liste des champions, visible par tous les participants
create or replace function public.round_champions()
returns table (round_id bigint, round_number int, display_name text, pot numeric, finished_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.number, coalesce(p.nickname, p.first_name)::text,
         (select count(*) from public.round_entries re where re.round_id = r.id and re.paid) * r.fee,
         r.finished_at
  from public.rounds r
  join public.profiles p on p.id = r.winner_id
  where r.winner_id is not null and auth.uid() is not null
  order by r.finished_at desc nulls last, r.number desc
$$;

revoke all on function public.round_champions() from public, anon;
grant execute on function public.round_champions() to authenticated;

-- 4. Enregistre tout de suite le gagnant des rondes déjà décidées (ronde 2: Jonathan)
select public.finalize_rounds() as rondes_terminees;

select r.number as ronde, r.status as statut, coalesce(p.nickname, p.first_name) as gagnant
from public.rounds r left join public.profiles p on p.id = r.winner_id
order by r.number;
