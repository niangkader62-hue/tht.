-- Journal en direct pour l'admin : inscriptions, connexions, echecs (a la seconde).
-- Tout le monde peut AJOUTER une ligne (l'app note les etapes), seuls les admins LISENT.
create table if not exists public.journal_inscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  email text check (email is null or char_length(email) <= 200),
  prenom text check (prenom is null or char_length(prenom) <= 80),
  telephone text check (telephone is null or char_length(telephone) <= 30),
  methode text check (methode in ('google','telephone')),
  etape text not null check (etape in ('google_clic','google_connecte','compte_cree','connexion','echec')),
  message text check (message is null or char_length(message) <= 500),
  appareil text check (appareil is null or char_length(appareil) <= 300),
  contacte_le timestamptz
);
create index if not exists journal_inscriptions_created_idx on public.journal_inscriptions (created_at desc);
alter table public.journal_inscriptions enable row level security;
drop policy if exists "journal_insert_tous" on public.journal_inscriptions;
create policy "journal_insert_tous" on public.journal_inscriptions for insert to anon, authenticated with check (contacte_le is null);
drop policy if exists "journal_select_admin" on public.journal_inscriptions;
create policy "journal_select_admin" on public.journal_inscriptions for select using (is_admin());
drop policy if exists "journal_update_admin" on public.journal_inscriptions;
create policy "journal_update_admin" on public.journal_inscriptions for update using (is_admin()) with check (is_admin());
grant insert on public.journal_inscriptions to anon, authenticated;
grant select, update on public.journal_inscriptions to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='journal_inscriptions') then
    alter publication supabase_realtime add table public.journal_inscriptions;
  end if;
end $$;
