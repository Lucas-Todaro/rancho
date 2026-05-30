-- Estrutura compatível com o Rancho Pro Full.
-- Use somente se quiser criar tabelas do zero ou comparar com suas tabelas atuais.

create extension if not exists "pgcrypto";

create table if not exists public.animals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag_number text not null,
  category text default 'vaca',
  breed text,
  birth_date date,
  weight_kg numeric default 0,
  reproductive_status text default 'normal',
  health_status text default 'ok',
  status text default 'ativo',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.milk_productions (
  id uuid primary key default gen_random_uuid(),
  animal_name text not null,
  animal_tag text,
  liters numeric not null default 0,
  period text default 'manha',
  produced_at date default current_date,
  quality text default 'boa',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'material',
  quantity numeric default 0,
  unit text default 'unidades',
  min_quantity numeric default 0,
  cost numeric default 0,
  supplier text,
  expiration_date date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('receita', 'despesa')),
  amount numeric not null default 0,
  category text,
  description text,
  due_date date default current_date,
  status text default 'pago',
  payment_method text default 'pix',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  salary numeric default 0,
  benefits numeric default 0,
  phone text,
  admission_date date,
  status text default 'ativo',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.payrolls (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  month text,
  base_salary numeric default 0,
  additions numeric default 0,
  discounts numeric default 0,
  benefits numeric default 0,
  net_salary numeric default 0,
  status text default 'aberta',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor text default 'Sistema',
  description text,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  level text default 'info',
  created_at timestamptz default now()
);

create table if not exists public.whatsapp_sessions (
  phone text primary key,
  state text not null default 'idle',
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter publication supabase_realtime add table public.animals;
alter publication supabase_realtime add table public.milk_productions;
alter publication supabase_realtime add table public.stock_items;
alter publication supabase_realtime add table public.financial_entries;
alter publication supabase_realtime add table public.employees;
alter publication supabase_realtime add table public.payrolls;

-- Para começar rápido em ambiente de teste, você pode liberar leitura/escrita para anon.
-- Em produção, ajuste RLS por usuário/fazenda.
-- alter table public.animals enable row level security;
-- create policy "allow all anon animals" on public.animals for all using (true) with check (true);
