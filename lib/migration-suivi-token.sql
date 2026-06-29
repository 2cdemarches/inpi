-- Migration : portail de suivi client
-- À coller dans Supabase > SQL Editor > New Query > Run

alter table clients
  add column if not exists suivi_token  uuid unique default gen_random_uuid(),
  add column if not exists suivi_sent_at timestamptz;

-- Index pour lookup rapide par token (accès public sans auth)
create index if not exists clients_suivi_token_idx on clients(suivi_token);
