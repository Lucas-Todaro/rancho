-- Rode este SQL manualmente no Supabase depois de aplicar a migration
-- 20260601001000_add_internal_tester_to_usuarios.sql.
-- Troque os e-mails abaixo pelos logins que devem ver as ferramentas internas.

update public.usuarios as u
set is_internal_tester = true
from auth.users as au
where u.id = au.id
  and au.email in (
    'seu-email@exemplo.com',
    'email-do-socio@exemplo.com'
  );

-- Alternativa por ID do usuario, se preferir:
-- update public.usuarios
-- set is_internal_tester = true
-- where id in (
--   '00000000-0000-0000-0000-000000000000',
--   '11111111-1111-1111-1111-111111111111'
-- );
