-- ============================================================================
-- Nutrition : objectif, journal alimentaire, aliments perso, pesées.
-- Toutes les tables sont PRIVEES : une seule policy « moi » par table, comme
-- private_metrics et user_settings. Rien de tout ça ne doit apparaitre dans le
-- fil ni sur un profil public.
-- A appliquer une fois (SQL editor Supabase ou migration).
-- ============================================================================

-- Objectif et profil metabolique (une ligne par utilisateur).
create table if not exists public.nutrition_goals (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  sexe             text not null check (sexe in ('H','F')),
  annee_naissance  int  not null check (annee_naissance between 1900 and 2100),
  taille_cm        numeric(5,1) not null check (taille_cm between 100 and 250),
  activite         text not null default 'modere',
  objectif         text not null default 'MAINTIEN' check (objectif in ('MASSE','SECHE','MAINTIEN')),
  rythme_pct       numeric(4,2) not null default 0 check (rythme_pct between 0 and 2),
  ajustement_kcal  int  not null default 0 check (ajustement_kcal between -500 and 500),
  updated_at       timestamptz not null default now()
);

-- Journal : une ligne par aliment mange. Les nutriments sont ceux de la
-- PORTION, figes a la saisie : modifier un aliment perso plus tard ne doit pas
-- reecrire l'historique.
create table if not exists public.food_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  jour        date not null,
  repas       text not null check (repas in ('petit-dej','dejeuner','diner','collation')),
  nom         text not null check (char_length(nom) between 1 and 200),
  marque      text,
  code_barres text,
  grammes     numeric(7,1) not null check (grammes > 0 and grammes <= 5000),
  kcal        numeric(7,1) not null check (kcal >= 0),
  proteines   numeric(6,1) not null default 0 check (proteines >= 0),
  glucides    numeric(6,1) not null default 0 check (glucides >= 0),
  lipides     numeric(6,1) not null default 0 check (lipides >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists food_entries_user_jour on public.food_entries (user_id, jour);

-- Aliments perso (pour 100 g).
create table if not exists public.custom_foods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nom         text not null check (char_length(nom) between 1 and 200),
  marque      text,
  kcal100     numeric(6,1) not null check (kcal100 >= 0),
  proteines100 numeric(5,1) not null default 0 check (proteines100 >= 0),
  glucides100 numeric(5,1) not null default 0 check (glucides100 >= 0),
  lipides100  numeric(5,1) not null default 0 check (lipides100 >= 0),
  portion_g   numeric(6,1) check (portion_g > 0),
  created_at  timestamptz not null default now()
);
create index if not exists custom_foods_user on public.custom_foods (user_id);

-- Historique de poids (private_metrics ne garde que la derniere valeur).
create table if not exists public.weight_logs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  jour       date not null,
  weight_kg  numeric(5,2) not null check (weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  primary key (user_id, jour)
);

do $$
declare t text;
begin
  foreach t in array array['nutrition_goals','food_entries','custom_foods','weight_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "moi" on public.%I', t);
    execute format(
      'create policy "moi" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
