-- JustList: uma lista particular para cada conta autenticada.
--
-- EXECUTE ESTE SCRIPT UMA ÚNICA VEZ no SQL Editor do Supabase.
-- ANTES DE EXECUTAR:
-- 1. crie no Supabase Auth a conta que será dona dos registros antigos;
-- 2. substitua SEU_EMAIL@EXEMPLO.COM pelo e-mail dessa conta.
--
-- Os registros existentes sem user_id serão transferidos para essa conta.
-- Novos registros só poderão ser criados pelo usuário autenticado atual.

begin;

alter table public.series enable row level security;

alter table public.series
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

do $$
declare
  owner_id uuid;
begin
  select id
    into owner_id
    from auth.users
   where lower(email) = lower('SEU_EMAIL@EXEMPLO.COM')
   limit 1;

  if owner_id is null then
    raise exception 'Crie primeiro no Supabase Auth o usuário SEU_EMAIL@EXEMPLO.COM e substitua o placeholder neste script.';
  end if;

  update public.series
     set user_id = owner_id
   where user_id is null;

  if exists (select 1 from public.series where user_id is null) then
    raise exception 'Há registros sem proprietário. A migração foi interrompida para evitar dados sem dono.';
  end if;
end
$$;

alter table public.series
  alter column user_id set not null;

create index if not exists series_user_id_idx
  on public.series(user_id);

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'series'
  loop
    execute format(
      'drop policy if exists %I on public.series',
      existing_policy.policyname
    );
  end loop;
end
$$;

revoke all on table public.series from anon;
revoke all on table public.series from authenticated;
grant select, insert, update, delete on table public.series to authenticated;

create policy series_user_select
on public.series
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy series_user_insert
on public.series
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy series_user_update
on public.series
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy series_user_delete
on public.series
for delete
to authenticated
using ((select auth.uid()) = user_id);

commit;
