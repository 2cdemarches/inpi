create table if not exists settings (
  id int primary key default 1,
  nom_cabinet text not null default '',
  representant_cabinet text not null default '',
  adresse_cabinet text not null default '',
  updated_at timestamptz default now()
);
insert into settings (id) values (1) on conflict do nothing;
