-- Learn with Adi — progress table + row-level security
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).

create table if not exists public.progress (
  user_id    uuid not null references auth.users (id) on delete cascade,
  course     text not null,
  chapter    text not null,
  title      text,
  completed  boolean not null default false,
  quiz_score integer,
  quiz_total integer,
  scroll_pct integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, course, chapter)
);

alter table public.progress enable row level security;

-- each student sees and edits only their own rows
create policy "own rows: select" on public.progress
  for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.progress
  for insert with check (auth.uid() = user_id);
create policy "own rows: update" on public.progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.progress
  for delete using (auth.uid() = user_id);
