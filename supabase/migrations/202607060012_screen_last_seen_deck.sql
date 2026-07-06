alter table public.screens
  add column if not exists last_seen_deck_version_id uuid,
  add column if not exists last_seen_at timestamptz;

alter table public.screens
  drop constraint if exists screens_last_seen_deck_version_fk;

alter table public.screens
  add constraint screens_last_seen_deck_version_fk
  foreign key (org_id, last_seen_deck_version_id)
  references public.deck_versions(org_id, id)
  on delete set null;

create index if not exists screens_last_seen_deck_idx
on public.screens(org_id, last_seen_deck_version_id, last_seen_at desc);
