-- Mise à jour 10 : correction du calcul des vies
-- A) Annule le calcul fait par erreur pour le 5 octobre 2026 (avant les matchs)
-- B) Empêche de calculer une journée qui n'est pas commencée

-- A1. Retire les résultats et les TARO automatiques du 5 octobre
delete from public.day_results where game_date = '2026-10-05';
delete from public.picks where game_date = '2026-10-05' and is_default;
update public.game_days set closed_at = null where game_date = '2026-10-05';

-- A2. Recalcule les vies de toutes les rondes à partir des résultats restants
update public.round_entries re
set lives = greatest(0, 3 - (select count(*) from public.day_results d
                             where d.round_id = re.round_id and d.user_id = re.user_id and d.life_lost));

-- B1. Le calcul direct n'est plus accessible depuis l'application (seulement via la fermeture)
revoke execute on function public.score_day(bigint, date) from authenticated;

-- B2. On ne peut pas fermer une journée avant la fin de la période de choix tardif
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
  return n;
end $$;

-- Vérification: vies actuelles de la ronde 2
select coalesce(p.nickname, p.first_name) as participant, re.lives as vies
from public.round_entries re
join public.rounds r on r.id = re.round_id
join public.profiles p on p.id = re.user_id
where r.number = 2
order by participant;
