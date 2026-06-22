-- Colle ce SQL dans Supabase > SQL Editor > New Query > Run

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Identité président / associé unique
  civilite text not null,              -- Monsieur / Madame
  prenom text not null,
  nom text not null,
  date_naissance text not null,        -- format JJ/MM/AAAA
  ville_naissance text not null,
  cp_naissance text not null,
  nationalite text default 'Française',
  adresse text not null,               -- adresse personnelle complète
  nom_pere text,
  nom_mere text,

  -- Société
  denomination text not null,
  type_societe text not null default 'SASU',  -- SASU, SAS, SARL, EURL, SCI...
  capital integer not null default 100,
  siege_social text not null,          -- adresse siège complète
  ville_siege text not null,
  objet_social text,
  nb_actions integer default 100,

  -- Signature
  date_signature text,                 -- JJ/MM/AAAA
  ville_signature text,

  -- Suivi
  statuts_manuels jsonb default '[]',  -- [{"label": "Acompte reçu", "date": "..."}]
  docusign_envelope_id text,
  inpi_dossier_id text,
  notes text
);

-- Index pour recherche rapide
create index if not exists clients_denomination_idx on clients(denomination);
create index if not exists clients_nom_idx on clients(nom);
