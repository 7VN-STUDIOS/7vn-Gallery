-- Run once in Supabase: SQL Editor > New query > paste > Run
create table profiles(id uuid primary key, email text, quota_bytes bigint default 5368709120, used_bytes bigint default 0, created_at timestamptz default now());
create table galleries(id uuid primary key default gen_random_uuid(), owner uuid not null, title text, token text unique not null, expires_at timestamptz, created_at timestamptz default now());
create table photos(id uuid primary key, gallery_id uuid references galleries(id) on delete cascade, owner uuid not null, segment text default '', filename text, key text, size bigint, thumb boolean default false, created_at timestamptz default now());
alter table profiles enable row level security;
alter table galleries enable row level security;
alter table photos enable row level security;
