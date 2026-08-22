-- Knowledge Garden: one private JSON snapshot per signed-in user.
-- Run this once in Supabase Dashboard → SQL Editor → New query.

create table if not exists public.knowledge_gardens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  garden jsonb not null default '{"version":3,"books":[],"cards":[],"seededPdca":true}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.knowledge_gardens enable row level security;

drop policy if exists "Users can read their own knowledge garden" on public.knowledge_gardens;
create policy "Users can read their own knowledge garden"
  on public.knowledge_gardens for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own knowledge garden" on public.knowledge_gardens;
create policy "Users can create their own knowledge garden"
  on public.knowledge_gardens for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own knowledge garden" on public.knowledge_gardens;
create policy "Users can update their own knowledge garden"
  on public.knowledge_gardens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';

