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
      check (papel in ('dono', 'admin', 'gerente', 'funcionario', 'veterinario', 'contador', 'bot_only'));
  end if;
end $$;
