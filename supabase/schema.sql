-- CAMC Seating — Supabase schema.
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to run again.
--
-- Security model: the Node server connects with the service-role key, which
-- bypasses Row Level Security. RLS is enabled on every table with NO policies,
-- so the public anon key (and anyone in a browser) cannot read or write data.

create extension if not exists pgcrypto;

create table if not exists public.camc_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  name          text not null,
  role          text not null check (role in ('admin', 'teacher')),
  password_salt text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.camc_sessions (
  token_hash text primary key,  -- SHA-256 of the cookie token; the raw token is never stored
  user_id    uuid not null references public.camc_users (id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists camc_sessions_expires_at_idx on public.camc_sessions (expires_at);
create index if not exists camc_sessions_user_id_idx on public.camc_sessions (user_id);

-- Classes and VIP categories shown in the seating legend.
create table if not exists public.camc_groups (
  id         text primary key,  -- short code shown on seats, e.g. '7A' or 'VIP'
  name       text not null,
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  kind       text not null default 'class' check (kind in ('class', 'vip')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.camc_events (
  id         text primary key,
  name       text not null,
  event_date text not null default '',
  layout     jsonb not null default '{}'::jsonb,  -- seatData, extraSeatList, balconySeatList, walkwaySeatList
  allocated  integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists camc_events_updated_at_idx on public.camc_events (updated_at desc);

create table if not exists public.camc_settings (
  key   text primary key,
  value text not null
);

alter table public.camc_users    enable row level security;
alter table public.camc_sessions enable row level security;
alter table public.camc_groups   enable row level security;
alter table public.camc_events   enable row level security;
alter table public.camc_settings enable row level security;

revoke all on public.camc_users, public.camc_sessions, public.camc_groups,
              public.camc_events, public.camc_settings from anon, authenticated;
