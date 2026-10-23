-- Run once in Supabase SQL Editor (admin activity log)
create table if not exists admin_log(id bigserial primary key, at timestamptz default now(), admin text, action text, target text);
alter table admin_log enable row level security;
