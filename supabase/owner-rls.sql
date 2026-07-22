-- JustList: leitura pública e escrita restrita ao proprietário.
--
-- ANTES DE EXECUTAR:
-- substitua TODAS as ocorrências de 'SEU_EMAIL@EXEMPLO.COM' pelo e-mail que
-- será usado no login por link mágico do Supabase.
--
-- Este script remove as políticas atuais da tabela `series` para evitar que
-- uma política antiga continue liberando escrita anônima.

begin;

alter table public.series enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'series'
  loop
    execute format(
      'drop policy if exists %I on public.series',
      existing_policy.policyname
    );
  end loop;
end
$$;

revoke insert, update, delete on table public.series from anon;
grant select on table public.series to anon, authenticated;
grant insert, update, delete on table public.series to authenticated;

create policy series_public_read
on public.series
for select
to anon, authenticated
using (true);

create policy series_owner_insert
on public.series
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('SEU_EMAIL@EXEMPLO.COM')
);

create policy series_owner_update
on public.series
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('SEU_EMAIL@EXEMPLO.COM')
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('SEU_EMAIL@EXEMPLO.COM')
);

create policy series_owner_delete
on public.series
for delete
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('SEU_EMAIL@EXEMPLO.COM')
);

commit;
