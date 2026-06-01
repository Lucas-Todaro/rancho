alter table if exists public.animais
  add column if not exists sexo text;

alter table if exists public.animais
  drop constraint if exists animais_sexo_check;

alter table if exists public.animais
  add constraint animais_sexo_check
  check (sexo is null or sexo in ('femea', 'macho', 'nao_informado'));
