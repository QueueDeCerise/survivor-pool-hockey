-- Mise à jour 3 : les prédictions restent secrètes aussi pour le gestionnaire
-- jusqu'à la limite finale de la journée (premier match + 30 minutes).

create or replace function public.pick_reveal_at(d date)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select g.first_game_at + interval '30 minutes'
  from public.game_days g
  where g.game_date = d
$$;

revoke all on function public.pick_reveal_at(date) from public, anon;
grant execute on function public.pick_reveal_at(date) to authenticated;

-- Le participant voit son propre choix. Le gestionnaire voit les choix seulement après la limite.
drop policy if exists picks_select on public.picks;
create policy picks_select on public.picks for select to authenticated using (
  user_id = auth.uid()
  or (public.is_admin() and now() >= public.pick_reveal_at(game_date))
);

drop policy if exists picks_insert on public.picks;
create policy picks_insert on public.picks for insert to authenticated with check (
  user_id = auth.uid()
);

drop policy if exists picks_update on public.picks;
create policy picks_update on public.picks for update to authenticated using (
  user_id = auth.uid()
  or (public.is_admin() and now() >= public.pick_reveal_at(game_date))
) with check (
  user_id = auth.uid()
  or (public.is_admin() and now() >= public.pick_reveal_at(game_date))
);

drop policy if exists picks_delete on public.picks;
create policy picks_delete on public.picks for delete to authenticated using (
  (user_id = auth.uid() and now() < (select g.first_game_at from public.game_days g where g.game_date = picks.game_date))
  or (public.is_admin() and now() >= public.pick_reveal_at(game_date))
);

-- Retirer un participant d'une ronde sans exposer ses choix secrets
create or replace function public.admin_remove_entry(p_round bigint, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé au gestionnaire.'; end if;
  delete from public.day_results where round_id = p_round and user_id = p_user;
  delete from public.picks where round_id = p_round and user_id = p_user;
  delete from public.round_entries where round_id = p_round and user_id = p_user;
end $$;

revoke all on function public.admin_remove_entry(bigint, uuid) from public, anon;
grant execute on function public.admin_remove_entry(bigint, uuid) to authenticated;

-- Révélation: le gestionnaire n'a plus d'accès anticipé
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

-- Journal: les entrées de choix restent cachées jusqu'à la limite
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated using (
  public.is_admin()
  and (
    table_name <> 'picks'
    or now() >= public.pick_reveal_at((coalesce(row_data, old_data)->>'game_date')::date)
  )
);
