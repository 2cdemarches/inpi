-- Migration : ajout des credentials API RNE INPI dans settings
-- À coller dans Supabase SQL Editor

alter table settings
  add column if not exists inpi_rne_username text default '',
  add column if not exists inpi_rne_password text default '';
