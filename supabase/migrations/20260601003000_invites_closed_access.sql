alter table if exists public.funcionarios
  add column if not exists email text,
  add column if not exists usuario_id uuid references auth.users(id) on delete set null,
  add column if not exists tipo_acesso text not null default 'bot_only',
  add column if not exists papel_sistema text,
  add column if not exists convite_status text;

create index if not exists funcionarios_fazenda_email_idx
  on public.funcionarios (fazenda_id, lower(email))
  where email is not null;

create index if not exists funcionarios_usuario_id_idx
  on public.funcionarios (usuario_id)
  where usuario_id is not null;

alter table if exists public.funcionarios
  drop constraint if exists funcionarios_tipo_acesso_check;

alter table if exists public.funcionarios
  add constraint funcionarios_tipo_acesso_check
  check (tipo_acesso in ('sistema', 'bot_only', 'sistema_whatsapp'));

alter table if exists public.funcionarios
  drop constraint if exists funcionarios_papel_sistema_check;

alter table if exists public.funcionarios
  add constraint funcionarios_papel_sistema_check
  check (papel_sistema is null or papel_sistema in ('dono', 'admin', 'gerente', 'funcionario', 'bot_only'));

alter table if exists public.funcionarios
  drop constraint if exists funcionarios_convite_status_check;

alter table if exists public.funcionarios
  add constraint funcionarios_convite_status_check
  check (convite_status is null or convite_status in ('pendente', 'aceito', 'expirado', 'cancelado'));

create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  funcionario_id uuid null references public.funcionarios(id) on delete set null,
  email text not null,
  nome text,
  cargo text,
  papel text not null default 'funcionario',
  status text not null default 'pendente',
  token_hash text not null unique,
  invited_by uuid null references auth.users(id) on delete set null,
  accepted_by uuid null references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint convites_email_normalizado_check check (email = lower(trim(email))),
  constraint convites_papel_check check (papel in ('dono', 'admin', 'gerente', 'funcionario')),
  constraint convites_status_check check (status in ('pendente', 'aceito', 'expirado', 'cancelado'))
);

create index if not exists convites_fazenda_status_idx
  on public.convites (fazenda_id, status, created_at desc);

create unique index if not exists convites_pendente_email_fazenda_idx
  on public.convites (fazenda_id, email)
  where status = 'pendente';

create or replace function public.touch_convites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_convites_updated_at on public.convites;

create trigger touch_convites_updated_at
before update on public.convites
for each row
execute function public.touch_convites_updated_at();

alter table public.convites enable row level security;

revoke all on table public.convites from anon;
revoke all on table public.convites from authenticated;
