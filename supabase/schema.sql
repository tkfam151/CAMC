-- CAMC Seating — Supabase setup.
--
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query →
-- paste this whole file → Run. It is safe to run again (for example after an
-- update); it never deletes events, classes or accounts.
--
-- How it is secured
--   The website (on GitHub Pages) talks to Supabase with the public "anon" key.
--   Row Level Security is enabled on every table. The public can only READ
--   events and classes/VIP groups. Every change goes through the camc_*
--   functions below, which check the caller's session token and role:
--     • administrator (camcadmin): create teacher accounts only
--     • teachers: edit seating charts, classes and VIP groups
--   Passwords are hashed with bcrypt; only a SHA-256 hash of each session
--   token is stored.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  -- Supabase keeps pgcrypto in the "extensions" schema; move it there if it was installed elsewhere.
  if (select n.nspname from pg_extension x join pg_namespace n on n.oid = x.extnamespace where x.extname = 'pgcrypto') <> 'extensions' then
    alter extension pgcrypto set schema extensions;
  end if;
end $$;

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

create table if not exists public.camc_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  name          text not null,
  role          text not null check (role in ('admin', 'teacher')),
  password_hash text not null,
  created_at    timestamptz not null default now()
);
-- Accounts from the earlier Node.js version used a different password format.
alter table public.camc_users drop column if exists password_salt;
delete from public.camc_users where password_hash not like '$2%';

create table if not exists public.camc_sessions (
  token_hash text primary key,
  user_id    uuid not null references public.camc_users (id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists camc_sessions_expires_at_idx on public.camc_sessions (expires_at);
create index if not exists camc_sessions_user_id_idx on public.camc_sessions (user_id);

create table if not exists public.camc_login_failures (
  username text not null,
  at       timestamptz not null default now()
);
create index if not exists camc_login_failures_idx on public.camc_login_failures (username, at);

-- Classes and VIP groups shown in the seating legend.
create table if not exists public.camc_groups (
  id         text primary key,  -- short code shown on seats, e.g. '7A' or 'VIP-Board'
  name       text not null,
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  kind       text not null default 'class' check (kind in ('class', 'vip')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.camc_events (
  id         text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
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
alter table public.camc_events alter column id set default encode(extensions.gen_random_bytes(6), 'hex');

create table if not exists public.camc_settings (
  key   text primary key,
  value text not null
);

/* ------------------------------------------------------------------ */
/* Access rules                                                        */
/* ------------------------------------------------------------------ */

alter table public.camc_users          enable row level security;
alter table public.camc_sessions       enable row level security;
alter table public.camc_login_failures enable row level security;
alter table public.camc_groups         enable row level security;
alter table public.camc_events         enable row level security;
alter table public.camc_settings       enable row level security;

revoke all on public.camc_users, public.camc_sessions, public.camc_login_failures,
              public.camc_groups, public.camc_events, public.camc_settings
  from anon, authenticated;

-- Anyone can read events and groups (that is what the public page shows).
grant select on public.camc_groups, public.camc_events to anon, authenticated;
drop policy if exists "Anyone can read groups" on public.camc_groups;
create policy "Anyone can read groups" on public.camc_groups for select to anon, authenticated using (true);
drop policy if exists "Anyone can read events" on public.camc_events;
create policy "Anyone can read events" on public.camc_events for select to anon, authenticated using (true);

/* ------------------------------------------------------------------ */
/* Internal helpers (not callable from the website)                    */
/* ------------------------------------------------------------------ */

create or replace function public.camc__user_json(u public.camc_users)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'role', u.role, 'createdAt', u.created_at);
$$;

create or replace function public.camc__group_json(g public.camc_groups)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color, 'kind', g.kind, 'sortOrder', g.sort_order);
$$;

create or replace function public.camc__event_json(e public.camc_events)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'date', e.event_date,
    'seatData', coalesce(e.layout -> 'seatData', '{}'::jsonb),
    'extraSeatList', coalesce(e.layout -> 'extraSeatList', '[]'::jsonb),
    'balconySeatList', coalesce(e.layout -> 'balconySeatList', '{"L":[],"R":[]}'::jsonb),
    'walkwaySeatList', coalesce(e.layout -> 'walkwaySeatList', '[]'::jsonb),
    'createdAt', e.created_at, 'createdBy', e.created_by,
    'updatedAt', e.updated_at, 'updatedBy', e.updated_by);
$$;

create or replace function public.camc__token_hash(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Returns the signed-in user for a session token, or raises 28000 ("Please sign in.").
create or replace function public.camc__session_user(p_token text)
returns public.camc_users language plpgsql security definer set search_path = '' as $$
declare
  s public.camc_sessions;
  u public.camc_users;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Please sign in.' using errcode = '28000';
  end if;
  select * into s from public.camc_sessions where token_hash = public.camc__token_hash(p_token);
  if not found or s.expires_at < now() then
    raise exception 'Please sign in.' using errcode = '28000';
  end if;
  if s.expires_at < now() + interval '11 hours 30 minutes' then
    update public.camc_sessions set expires_at = now() + interval '12 hours' where token_hash = s.token_hash;
  end if;
  select * into u from public.camc_users where id = s.user_id;
  if not found then
    raise exception 'Please sign in.' using errcode = '28000';
  end if;
  return u;
end $$;

create or replace function public.camc__require(p_token text, p_role text, p_message text)
returns public.camc_users language plpgsql security definer set search_path = '' as $$
declare
  u public.camc_users := public.camc__session_user(p_token);
begin
  if u.role <> p_role then
    raise exception '%', p_message using errcode = '42501';
  end if;
  return u;
end $$;

create or replace function public.camc__check_layout(p_layout jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_layout is null or jsonb_typeof(p_layout) <> 'object'
     or jsonb_typeof(coalesce(p_layout -> 'seatData', '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid seating layout.' using errcode = '22023';
  end if;
  if pg_column_size(p_layout) > 8 * 1024 * 1024 then
    raise exception 'This seating chart is too large. Try smaller photos.' using errcode = '22023';
  end if;
end $$;

/* ------------------------------------------------------------------ */
/* Sign in / account                                                   */
/* ------------------------------------------------------------------ */

-- Returns {token, user} on success or {error} on failure (so failures can be counted).
create or replace function public.camc_login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  u public.camc_users;
  v_token text;
begin
  if (select count(*) from public.camc_login_failures
      where username = v_username and at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('error', 'Too many attempts. Try again in a few minutes.');
  end if;

  select * into u from public.camc_users where username = v_username;
  if not found or u.password_hash <> extensions.crypt(coalesce(p_password, ''), u.password_hash) then
    insert into public.camc_login_failures (username) values (v_username);
    delete from public.camc_login_failures where at < now() - interval '1 day';
    return jsonb_build_object('error', 'Incorrect username or password.');
  end if;

  delete from public.camc_login_failures where username = v_username;
  delete from public.camc_sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.camc_sessions (token_hash, user_id, expires_at)
  values (public.camc__token_hash(v_token), u.id, now() + interval '12 hours');
  return jsonb_build_object('token', v_token, 'user', public.camc__user_json(u));
end $$;

create or replace function public.camc_logout(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.camc_sessions where token_hash = public.camc__token_hash(coalesce(p_token, ''));
$$;

-- The signed-in user, or null.
create or replace function public.camc_me(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.camc__user_json(public.camc__session_user(p_token));
exception when sqlstate '28000' then
  return null;
end $$;

create or replace function public.camc_change_password(p_token text, p_current text, p_new text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  u public.camc_users := public.camc__session_user(p_token);
begin
  if u.password_hash <> extensions.crypt(coalesce(p_current, ''), u.password_hash) then
    raise exception 'Current password is incorrect.' using errcode = '22023';
  end if;
  if length(coalesce(p_new, '')) < 6 then
    raise exception 'New password must be at least 6 characters.' using errcode = '22023';
  end if;
  update public.camc_users set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf')) where id = u.id;
  -- Sign out other devices.
  delete from public.camc_sessions where user_id = u.id and token_hash <> public.camc__token_hash(p_token);
end $$;

/* ------------------------------------------------------------------ */
/* Teacher accounts (administrator only)                               */
/* ------------------------------------------------------------------ */

create or replace function public.camc_list_teachers(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.camc__require(p_token, 'admin', 'Only the administrator can manage teacher accounts.');
  return coalesce((select jsonb_agg(public.camc__user_json(u) order by u.name)
                   from public.camc_users u where u.role = 'teacher'), '[]'::jsonb);
end $$;

create or replace function public.camc_create_teacher(p_token text, p_username text, p_name text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_name text := left(trim(coalesce(p_name, '')), 120);
  u public.camc_users;
begin
  perform public.camc__require(p_token, 'admin', 'Only the administrator can manage teacher accounts.');
  if v_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from public.camc_users where username = v_username) then
    raise exception 'That username is already taken.' using errcode = '23505';
  end if;
  insert into public.camc_users (username, name, role, password_hash)
  values (v_username, coalesce(nullif(v_name, ''), v_username), 'teacher', extensions.crypt(p_password, extensions.gen_salt('bf')))
  returning * into u;
  return public.camc__user_json(u);
end $$;

/* ------------------------------------------------------------------ */
/* Classes and VIP groups (teachers)                                   */
/* ------------------------------------------------------------------ */

create or replace function public.camc__check_group(p_name text, p_color text, p_kind text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name is required.' using errcode = '22023';
  end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Choose a colour.' using errcode = '22023';
  end if;
  if coalesce(p_kind, '') not in ('class', 'vip') then
    raise exception 'Choose Class or VIP.' using errcode = '22023';
  end if;
end $$;

create or replace function public.camc_create_group(p_token text, p_id text, p_name text, p_color text, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id text := trim(coalesce(p_id, ''));
  g public.camc_groups;
begin
  perform public.camc__require(p_token, 'teacher', 'Only teachers can manage classes and VIP groups.');
  if length(v_id) not between 1 and 20 or v_id ~ '[[:cntrl:]/\\]' then
    raise exception 'Code must be 1–20 characters (e.g. 7A or VIP-Board).' using errcode = '22023';
  end if;
  perform public.camc__check_group(p_name, p_color, p_kind);
  if exists (select 1 from public.camc_groups where lower(id) = lower(v_id)) then
    raise exception 'A group with that code already exists.' using errcode = '23505';
  end if;
  insert into public.camc_groups (id, name, color, kind, sort_order)
  values (v_id, left(trim(p_name), 120), lower(p_color), p_kind,
          coalesce((select max(sort_order) from public.camc_groups), 0) + 10)
  returning * into g;
  return public.camc__group_json(g);
end $$;

create or replace function public.camc_update_group(p_token text, p_id text, p_name text, p_color text, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.camc_groups;
begin
  perform public.camc__require(p_token, 'teacher', 'Only teachers can manage classes and VIP groups.');
  perform public.camc__check_group(p_name, p_color, p_kind);
  update public.camc_groups
     set name = left(trim(p_name), 120), color = lower(p_color), kind = p_kind
   where id = p_id
  returning * into g;
  if not found then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  return public.camc__group_json(g);
end $$;

create or replace function public.camc_delete_group(p_token text, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.camc__require(p_token, 'teacher', 'Only teachers can manage classes and VIP groups.');
  delete from public.camc_groups where id = p_id;
end $$;

/* ------------------------------------------------------------------ */
/* Seating charts (teachers)                                           */
/* ------------------------------------------------------------------ */

create or replace function public.camc_create_event(p_token text, p_name text, p_date text, p_layout jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u public.camc_users := public.camc__require(p_token, 'teacher', 'Only teachers can edit seating charts.');
  e public.camc_events;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Event name is required.' using errcode = '22023';
  end if;
  perform public.camc__check_layout(p_layout);
  insert into public.camc_events (name, event_date, layout, allocated, created_by, updated_by)
  values (left(trim(p_name), 120), left(coalesce(p_date, ''), 20), p_layout,
          (select count(*) from jsonb_object_keys(coalesce(p_layout -> 'seatData', '{}'::jsonb))),
          u.name, u.name)
  returning * into e;
  return public.camc__event_json(e);
end $$;

create or replace function public.camc_update_event(p_token text, p_id text, p_name text, p_date text, p_layout jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u public.camc_users := public.camc__require(p_token, 'teacher', 'Only teachers can edit seating charts.');
  e public.camc_events;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Event name is required.' using errcode = '22023';
  end if;
  perform public.camc__check_layout(p_layout);
  update public.camc_events
     set name = left(trim(p_name), 120),
         event_date = left(coalesce(p_date, ''), 20),
         layout = p_layout,
         allocated = (select count(*) from jsonb_object_keys(coalesce(p_layout -> 'seatData', '{}'::jsonb))),
         updated_at = now(),
         updated_by = u.name
   where id = p_id
  returning * into e;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  return public.camc__event_json(e);
end $$;

create or replace function public.camc_delete_event(p_token text, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.camc__require(p_token, 'teacher', 'Only teachers can edit seating charts.');
  delete from public.camc_events where id = p_id;
end $$;

/* ------------------------------------------------------------------ */
/* Function permissions                                                */
/* ------------------------------------------------------------------ */

revoke execute on function
  public.camc__user_json(public.camc_users),
  public.camc__group_json(public.camc_groups),
  public.camc__event_json(public.camc_events),
  public.camc__token_hash(text),
  public.camc__session_user(text),
  public.camc__require(text, text, text),
  public.camc__check_layout(jsonb),
  public.camc__check_group(text, text, text)
from public, anon, authenticated;

grant execute on function
  public.camc_login(text, text),
  public.camc_logout(text),
  public.camc_me(text),
  public.camc_change_password(text, text, text),
  public.camc_list_teachers(text),
  public.camc_create_teacher(text, text, text, text),
  public.camc_create_group(text, text, text, text, text),
  public.camc_update_group(text, text, text, text, text),
  public.camc_delete_group(text, text),
  public.camc_create_event(text, text, text, jsonb),
  public.camc_update_event(text, text, text, text, jsonb),
  public.camc_delete_event(text, text)
to anon, authenticated;

/* ------------------------------------------------------------------ */
/* Starting data                                                       */
/* ------------------------------------------------------------------ */

-- Administrator account. Change the password after first sign-in.
insert into public.camc_users (username, name, role, password_hash)
values ('camcadmin', 'CAMC Administrator', 'admin', extensions.crypt('sisbcamc', extensions.gen_salt('bf')))
on conflict (username) do nothing;

-- Default classes and VIP group (added only once, so deleted ones stay deleted).
do $$
begin
  if not exists (select 1 from public.camc_settings where key = 'groups_seeded') then
    insert into public.camc_groups (id, name, color, kind, sort_order) values
      ('7A', '7 Archimedes (7A)', '#00b8d9', 'class', 0),
      ('7E', '7 Einstein (7E)', '#ff2d55', 'class', 10),
      ('7F', '7 Franklin (7F)', '#2563eb', 'class', 20),
      ('7Lang', '7 Lang', '#f5a623', 'class', 30),
      ('7N', '7 Newton (7N)', '#a855f7', 'class', 40),
      ('7P', '7 Pasteur (7P)', '#65a30d', 'class', 50),
      ('7T', '7 Tesla (7T)', '#ec4899', 'class', 60),
      ('8A', '8 Austen (8A)', '#f97316', 'class', 70),
      ('8B', '8 Byron (8B)', '#0891b2', 'class', 80),
      ('8H', '8 Hemingway (8H)', '#15803d', 'class', 90),
      ('8Lang', '8 Lang', '#e11d48', 'class', 100),
      ('8M', '8 Mendelssohn (8M)', '#22c55e', 'class', 110),
      ('8S', '8 Shakespeare (8S)', '#eab308', 'class', 120),
      ('8W', '8 Wordsworth (8W)', '#4f46e5', 'class', 130),
      ('9B', '9 Beethoven (9B)', '#f43f5e', 'class', 140),
      ('9G', '9 Gershwin (9G)', '#0ea5e9', 'class', 150),
      ('9H', '9 Haydn (9H)', '#7c3aed', 'class', 160),
      ('9M', '9 Mozart (9M)', '#fb7185', 'class', 170),
      ('9S', '9 Schubert (9S)', '#10b981', 'class', 180),
      ('9T', '9 Turing (9T)', '#d946ef', 'class', 190),
      ('10L', '10 Leonardo (10L)', '#d97706', 'class', 200),
      ('10M', '10 Monet (10M)', '#16a34a', 'class', 210),
      ('10P', '10 Picasso (10P)', '#ea580c', 'class', 220),
      ('10R', '10 Rutherford (10R)', '#0e7490', 'class', 230),
      ('10V', '10 Van Gogh (10V)', '#9333ea', 'class', 240),
      ('11A', '11 Aristotle (11A)', '#0284c7', 'class', 250),
      ('11P', '11 Plato (11P)', '#1d4ed8', 'class', 260),
      ('11R', '11 Ramanujan (11R)', '#ff9500', 'class', 270),
      ('11S', '11 Socrates (11S)', '#dc2626', 'class', 280),
      ('11V', '11 Voltaire (11V)', '#059669', 'class', 290),
      ('12G', '12 Gryphon (12G)', '#db2777', 'class', 300),
      ('12M', '12 Merlion (12M)', '#7e22ce', 'class', 310),
      ('12P', '12 Phoenix (12P)', '#c2410c', 'class', 320),
      ('12U', '12 Unicorn (12U)', '#6366f1', 'class', 330),
      ('Council', 'Student Council (สภานักเรียน)', '#ef4444', 'class', 340),
      ('SMT', 'SMT', '#ff007f', 'class', 350),
      ('PST', 'PST', '#f472b6', 'class', 360),
      ('Teacher', 'Teacher', '#991b1b', 'class', 370),
      ('VIP', 'VIP', '#c9a227', 'vip', 1000)
    on conflict (id) do nothing;
    insert into public.camc_settings (key, value) values ('groups_seeded', 'true');
  end if;
end $$;

-- Ask the API to pick up the new functions straight away.
notify pgrst, 'reload schema';
