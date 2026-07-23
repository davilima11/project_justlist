-- JustList: remove colunas que não são usadas pela aplicação atual.
--
-- ATENÇÃO: este comando apaga definitivamente os dados dessas colunas.
-- Faça um backup/export da tabela public.series antes de executar.
-- A migração não altera as políticas RLS nem as colunas usadas pelo site.

begin;

alter table public.series
  drop column if exists tmdb_id,
  drop column if exists author,
  drop column if exists chapters,
  drop column if exists current_chapter,
  drop column if exists reading_status,
  drop column if exists publication_status;

commit;
