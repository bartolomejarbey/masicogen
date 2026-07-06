-- Hardening pass after UX/security audit.

alter table public.canteens
  add constraint canteens_org_location_id_unique unique (org_id, location_id, id);

alter table public.screens
  add constraint screens_canteen_matches_location_fk
  foreign key (org_id, location_id, canteen_id)
  references public.canteens(org_id, location_id, id)
  on delete cascade;

alter table public.menu_sources
  add constraint menu_sources_canteen_matches_location_fk
  foreign key (org_id, location_id, canteen_id)
  references public.canteens(org_id, location_id, id)
  on delete cascade;

alter table public.menus
  add constraint menus_canteen_matches_location_fk
  foreign key (org_id, location_id, canteen_id)
  references public.canteens(org_id, location_id, id)
  on delete cascade;

alter table public.slide_decks
  add constraint slide_decks_canteen_matches_location_fk
  foreign key (org_id, location_id, canteen_id)
  references public.canteens(org_id, location_id, id)
  on delete cascade;

alter table public.menu_versions
  add constraint menu_versions_parent_id_unique unique (org_id, menu_id, id);

alter table public.template_versions
  add constraint template_versions_parent_id_unique unique (org_id, template_id, id);

alter table public.deck_versions
  add constraint deck_versions_parent_id_unique unique (org_id, deck_id, id);

alter table public.menus
  add constraint menus_current_version_parent_fk
  foreign key (org_id, id, current_version_id)
  references public.menu_versions(org_id, menu_id, id)
  deferrable initially deferred;

alter table public.templates
  add constraint templates_current_version_parent_fk
  foreign key (org_id, id, current_version_id)
  references public.template_versions(org_id, template_id, id)
  deferrable initially deferred;

alter table public.slide_decks
  add constraint slide_decks_published_version_parent_fk
  foreign key (org_id, id, published_deck_version_id)
  references public.deck_versions(org_id, deck_id, id)
  deferrable initially deferred;

alter table public.screens
  add constraint screens_current_deck_version_fk
  foreign key (org_id, current_deck_version_id)
  references public.deck_versions(org_id, id)
  deferrable initially deferred;

alter table public.render_jobs
  add column if not exists leased_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists lease_token uuid,
  add constraint render_jobs_attempts_check check (attempts <= max_attempts);

alter table public.exports
  add column if not exists asset_id uuid,
  add constraint exports_positive_size check (size_bytes is null or size_bytes > 0),
  add constraint exports_positive_duration check (duration_seconds is null or duration_seconds > 0),
  add constraint exports_asset_fk foreign key (org_id, asset_id) references public.assets(org_id, id) on delete set null,
  add constraint exports_bucket_path_unique unique (bucket, object_path);

create index if not exists org_memberships_user_idx on public.org_memberships(user_id, org_id);
create index if not exists membership_location_scopes_user_idx on public.membership_location_scopes(user_id, org_id, location_id);
create index if not exists locations_org_idx on public.locations(org_id);
create index if not exists canteens_org_location_idx on public.canteens(org_id, location_id);
create index if not exists screens_org_location_idx on public.screens(org_id, location_id);
create index if not exists screen_tokens_screen_idx on public.screen_tokens(org_id, screen_id);
create index if not exists menus_org_canteen_date_idx on public.menus(org_id, canteen_id, menu_date);
create index if not exists menu_versions_menu_idx on public.menu_versions(org_id, menu_id, created_at desc);
create index if not exists deck_versions_deck_idx on public.deck_versions(org_id, deck_id, created_at desc);
create index if not exists render_jobs_status_idx on public.render_jobs(status, created_at);
create index if not exists render_jobs_lease_idx on public.render_jobs(lease_expires_at) where status in ('leased', 'running', 'retrying');
create index if not exists exports_retention_idx on public.exports(retention_until) where retention_until is not null;

create or replace function private.prevent_approved_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved', 'published') then
      raise exception 'Approved and published versions are immutable';
    end if;
    return old;
  end if;

  if old.status in ('approved', 'published') then
    if old.status = 'approved'
      and new.status = 'published'
      and (to_jsonb(old) - 'status') = (to_jsonb(new) - 'status') then
      return new;
    end if;

    raise exception 'Approved and published versions are immutable';
  end if;

  if old.created_at <> new.created_at then
    raise exception 'Version creation metadata is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.prevent_template_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Template versions are immutable; create a new version instead';
  end if;

  if old.org_id <> new.org_id
    or old.template_id <> new.template_id
    or old.version <> new.version
    or old.manifest_json <> new.manifest_json
    or old.created_at <> new.created_at then
    raise exception 'Template version payload is immutable; create a new version instead';
  end if;

  return new;
end;
$$;

drop trigger if exists immutable_menu_versions on public.menu_versions;
create trigger immutable_menu_versions
before update or delete on public.menu_versions
for each row execute function private.prevent_approved_version_mutation();

drop trigger if exists immutable_template_versions on public.template_versions;
create trigger immutable_template_versions
before update or delete on public.template_versions
for each row execute function private.prevent_template_version_mutation();

drop trigger if exists immutable_deck_versions on public.deck_versions;
create trigger immutable_deck_versions
before update or delete on public.deck_versions
for each row execute function private.prevent_approved_version_mutation();

create or replace function private.storage_org_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) < 3 or parts[1] <> 'org' then
    return null;
  end if;
  return parts[2]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

drop policy if exists "authenticated users read private org storage" on storage.objects;
drop policy if exists "authenticated users upload allowed private objects" on storage.objects;

create policy "members read org scoped private storage"
on storage.objects for select
to authenticated
using (
  bucket_id in ('source-uploads', 'generated-assets', 'template-previews', 'exports')
  and private.storage_org_id(name) is not null
  and private.is_org_member(private.storage_org_id(name), null)
);

create policy "editors upload org scoped source and generated assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('source-uploads', 'generated-assets', 'template-previews')
  and private.storage_org_id(name) is not null
  and private.is_org_member(
    private.storage_org_id(name),
    array['owner', 'admin', 'editor', 'designer']::public.org_role[]
  )
);

create policy "members read templates"
on public.templates for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "members read template versions"
on public.template_versions for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "members read slides"
on public.slides for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "members read approvals"
on public.approval_requests for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "approvers manage approvals"
on public.approval_requests for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'approver']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'approver']::public.org_role[]));

create policy "members read exports"
on public.exports for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "members read publish events"
on public.publish_events for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "members read usage ledger"
on public.usage_ledger for select
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin']::public.org_role[]));

create policy "members read audit log"
on public.audit_log for select
to authenticated
using (org_id is null or private.is_org_member(org_id, array['owner', 'admin']::public.org_role[]));
