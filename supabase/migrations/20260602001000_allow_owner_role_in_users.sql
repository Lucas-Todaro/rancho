do $$
declare
  role_value text;
  role_type text;
begin
  select format('%I.%I', n.nspname, t.typname)
    into role_type
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where t.typname = 'usuario_papel'
  limit 1;

  if role_type is not null then
    foreach role_value in array array['dono', 'admin', 'gerente', 'funcionario', 'veterinario', 'contador', 'bot_only']
    loop
      execute format('alter type %s add value if not exists %L', role_type, role_value);
    end loop;
  end if;
end $$;

do $$
declare
  constraint_record record;
begin
  if to_regclass('public.usuarios') is not null then
    for constraint_record in
      select conname
      from pg_constraint
      where conrelid = 'public.usuarios'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%papel%'
    loop
      execute format('alter table public.usuarios drop constraint if exists %I', constraint_record.conname);
    end loop;

    alter table public.usuarios
      add constraint usuarios_papel_check
      check (papel::text in ('dono', 'admin', 'gerente', 'funcionario', 'veterinario', 'contador', 'bot_only'));
  end if;
end $$;
