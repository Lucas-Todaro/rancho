alter table if exists public.usuarios
  add column if not exists is_internal_tester boolean not null default false;

comment on column public.usuarios.is_internal_tester is
  'Libera ferramentas internas de teste do WhatsApp. Nao deve ser editado por clientes.';

create or replace function public.prevent_is_internal_tester_client_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_internal_tester is true then
      if coalesce(current_setting('app.internal_operation', true), '') <> 'true'
        and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
        raise exception 'Apenas operacoes internas podem alterar is_internal_tester.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.is_internal_tester is distinct from new.is_internal_tester then
      if coalesce(current_setting('app.internal_operation', true), '') <> 'true'
        and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
        raise exception 'Apenas operacoes internas podem alterar is_internal_tester.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_is_internal_tester_client_update on public.usuarios;

create trigger prevent_is_internal_tester_client_update
before insert or update of is_internal_tester on public.usuarios
for each row
execute function public.prevent_is_internal_tester_client_update();
