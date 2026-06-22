-- Colle ce SQL dans Supabase > SQL Editor > New Query > Run
create table if not exists tokens (
  key text primary key,
  value text not null,
  expires_at timestamptz,
  updated_at timestamptz default now()
);
