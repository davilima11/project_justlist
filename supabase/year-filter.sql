-- JustList: suporte ao filtro por ano de lançamento.
-- Execute no SQL Editor apenas se public.series ainda não tiver a coluna year.

alter table public.series
  add column if not exists year integer;

create index if not exists series_year_idx
  on public.series(year);
