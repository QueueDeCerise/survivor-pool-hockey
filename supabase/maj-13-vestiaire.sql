-- Mise à jour 13 : le Vestiaire, discussion en temps réel entre participants

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);

-- Protection: auteur forcé, message nettoyé, pas de rafale de messages
create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.user_id := auth.uid();
  new.body := trim(new.body);
  if char_length(new.body) = 0 then raise exception 'Le message est vide.'; end if;
  if exists (select 1 from public.chat_messages m where m.user_id = new.user_id and m.created_at > now() - interval '3 seconds') then
    raise exception 'Doucement! Attends quelques secondes entre deux messages.';
  end if;
  return new;
end $$;

drop trigger if exists chat_guard on public.chat_messages;
create trigger chat_guard before insert on public.chat_messages
  for each row execute function public.chat_guard();

-- Les suppressions par le gestionnaire sont conservées dans le journal d'audit
drop trigger if exists audit_chat_messages on public.chat_messages;
create trigger audit_chat_messages after delete on public.chat_messages
  for each row execute function public.audit_trigger();

-- Sécurité: seuls les participants connectés lisent et écrivent
alter table public.chat_messages enable row level security;

drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages for select to authenticated using (true);

drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages for insert to authenticated with check (user_id = auth.uid());

drop policy if exists chat_delete on public.chat_messages;
create policy chat_delete on public.chat_messages for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Noms affichés (surnoms seulement, jamais les courriels)
create or replace function public.chat_authors()
returns table (id uuid, display_name text, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.nickname, p.first_name)::text, p.is_admin
  from public.profiles p
  where auth.uid() is not null
$$;

revoke all on function public.chat_authors() from public, anon;
grant execute on function public.chat_authors() to authenticated;

-- Temps réel
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

select 'Mise à jour 13 installée' as resultat;
