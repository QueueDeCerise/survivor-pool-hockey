-- Mise à jour 12 : les choix ferment au début du premier match de la journée
-- (fin de la période de choix tardif de 30 minutes)

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

  -- Heure limite unique: le début du premier match
  if now() >= v_first then
    raise exception 'Les choix sont fermés depuis le début du premier match.';
  end if;

  select * into v_player from public.players where id = new.player_id;
  if not found or not v_player.approved or v_player.is_default then
    raise exception 'Ce joueur n''est pas encore sélectionnable.';
  end if;
  return new;
end $$;

select 'Mise à jour 12 installée' as resultat;
