-- Rode este SQL manualmente no Supabase depois de aplicar as migrations:
-- 20260601001000_add_internal_tester_to_usuarios.sql
-- 20260601002000_fix_internal_tester_admin_flow.sql
-- Troque os e-mails abaixo pelos logins que devem ver as ferramentas internas.

begin;
select set_config('app.internal_operation', 'true', true);

update public.usuarios as u
set is_internal_tester = true
from auth.users as au
where u.id = au.id
  and au.email in (
    'seu-email@exemplo.com',
    'email-do-socio@exemplo.com'
  );

commit;

-- Para remover acesso interno, use o mesmo bloco com false:
-- begin;
-- select set_config('app.internal_operation', 'true', true);
-- update public.usuarios as u
-- set is_internal_tester = false
-- from auth.users as au
-- where u.id = au.id
--   and au.email in ('email@exemplo.com');
-- commit;

-- Alternativa por ID do usuario, se preferir:
-- begin;
-- select set_config('app.internal_operation', 'true', true);
-- update public.usuarios
-- set is_internal_tester = true
-- where id in (
--   '00000000-0000-0000-0000-000000000000',
--   '11111111-1111-1111-1111-111111111111'
-- );
-- commit;
