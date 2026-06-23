-- ═══════════════════════════════════════════════════════════════
-- MIGRATION MULTI-TENANT — à coller dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Ajouter user_id sur clients
alter table clients add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Recréer la table settings avec user_id comme clé
drop table if exists settings;
create table settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz default now(),

  -- Cabinet (pouvoir)
  nom_cabinet text default '',
  representant_cabinet text default '',
  adresse_cabinet text default '',

  -- DocuSign
  docusign_integration_key text default '',
  docusign_user_id text default '',
  docusign_account_id text default '',
  docusign_private_key text default '',
  docusign_env text default 'production',

  -- INPI guichet
  inpi_login text default '',
  inpi_password text default ''
);

-- 3. Row Level Security
alter table clients enable row level security;
alter table settings enable row level security;

-- Clients : chaque user voit seulement ses clients
create policy "clients_user" on clients
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Settings : chaque user voit seulement ses settings
create policy "settings_user" on settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
