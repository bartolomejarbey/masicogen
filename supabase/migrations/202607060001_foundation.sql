create extension if not exists pgcrypto;
create extension if not exists pg_jsonschema;

create schema if not exists private;

create type public.org_role as enum (
  'owner',
  'admin',
  'editor',
  'designer',
  'approver',
  'publisher',
  'viewer'
);

create type public.approval_status as enum (
  'draft',
  'needs_review',
  'approved',
  'rejected',
  'published'
);

create type public.render_job_status as enum (
  'queued',
  'leased',
  'running',
  'retrying',
  'succeeded',
  'failed',
  'canceled'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  monthly_budget_czk integer not null default 5000,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.org_memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.org_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  timezone text not null default 'Europe/Prague',
  display_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

create table public.canteens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, location_id) references public.locations(org_id, id) on delete cascade
);

create table public.membership_location_scopes (
  org_id uuid not null,
  user_id uuid not null,
  location_id uuid not null,
  primary key (org_id, user_id, location_id),
  foreign key (org_id, user_id) references public.org_memberships(org_id, user_id) on delete cascade,
  foreign key (org_id, location_id) references public.locations(org_id, id) on delete cascade
);

create table public.screens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  canteen_id uuid not null,
  name text not null,
  status text not null default 'unpaired',
  current_deck_version_id uuid,
  last_heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, location_id) references public.locations(org_id, id) on delete cascade,
  foreign key (org_id, canteen_id) references public.canteens(org_id, id) on delete cascade
);

create table public.screen_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  screen_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (org_id, screen_id) references public.screens(org_id, id) on delete cascade
);

create table public.allergens (
  code text primary key,
  short_name text not null,
  full_name text not null,
  needs_specific_source boolean not null default false
);

insert into public.allergens (code, short_name, full_name, needs_specific_source)
values
  ('1', 'Lepek', 'Obiloviny obsahující lepek', true),
  ('2', 'Korýši', 'Korýši a výrobky z nich', false),
  ('3', 'Vejce', 'Vejce a výrobky z nich', false),
  ('4', 'Ryby', 'Ryby a výrobky z nich', false),
  ('5', 'Arašídy', 'Podzemnice olejná a výrobky z ní', false),
  ('6', 'Sója', 'Sójové boby a výrobky z nich', false),
  ('7', 'Mléko', 'Mléko a výrobky z něj včetně laktózy', false),
  ('8', 'Skořápkové plody', 'Skořápkové plody a výrobky z nich', true),
  ('9', 'Celer', 'Celer a výrobky z něj', false),
  ('10', 'Hořčice', 'Hořčice a výrobky z ní', false),
  ('11', 'Sezam', 'Sezamová semena a výrobky z nich', false),
  ('12', 'Siřičitany', 'Oxid siřičitý a siřičitany', false),
  ('13', 'Vlčí bob', 'Vlčí bob a výrobky z něj', false),
  ('14', 'Měkkýši', 'Měkkýši a výrobky z nich', false)
on conflict (code) do nothing;

create table public.menu_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  canteen_id uuid not null,
  uploaded_by uuid references public.profiles(id),
  bucket text not null,
  object_path text not null,
  mime_type text not null,
  original_file_name text,
  status text not null default 'uploaded',
  extracted_text text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, location_id) references public.locations(org_id, id) on delete cascade,
  foreign key (org_id, canteen_id) references public.canteens(org_id, id) on delete cascade
);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  canteen_id uuid not null,
  menu_date date not null,
  status public.approval_status not null default 'draft',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, canteen_id, menu_date),
  foreign key (org_id, location_id) references public.locations(org_id, id) on delete cascade,
  foreign key (org_id, canteen_id) references public.canteens(org_id, id) on delete cascade
);

create table public.menu_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  menu_id uuid not null,
  source_id uuid,
  status public.approval_status not null default 'draft',
  extraction_model text,
  extraction_prompt_version text,
  snapshot jsonb not null,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, menu_id) references public.menus(org_id, id) on delete cascade,
  foreign key (org_id, source_id) references public.menu_sources(org_id, id) on delete set null
);

alter table public.menus
  add constraint menus_current_version_fk
  foreign key (org_id, current_version_id) references public.menu_versions(org_id, id);

create table public.menu_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  menu_version_id uuid not null,
  section_id text not null,
  section_name text not null,
  item_id text not null,
  display_name text not null,
  short_name text,
  description text,
  price_czk integer,
  allergen_codes text[] not null default '{}',
  allergens_unknown boolean not null default false,
  available boolean not null default true,
  highlight boolean not null default false,
  sort_order integer not null default 0,
  foreign key (org_id, menu_version_id) references public.menu_versions(org_id, id) on delete cascade
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bucket text not null,
  object_path text not null,
  type text not null,
  sha256 text,
  width integer,
  height integer,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (bucket, object_path)
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  kind text not null,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, slug)
);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  version integer not null,
  manifest_json jsonb not null,
  preview_asset_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, template_id, version),
  foreign key (org_id, template_id) references public.templates(org_id, id) on delete cascade,
  foreign key (org_id, preview_asset_id) references public.assets(org_id, id) on delete set null
);

alter table public.templates
  add constraint templates_current_version_fk
  foreign key (org_id, current_version_id) references public.template_versions(org_id, id);

create table public.slide_decks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  canteen_id uuid not null,
  name text not null,
  published_deck_version_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, location_id) references public.locations(org_id, id) on delete cascade,
  foreign key (org_id, canteen_id) references public.canteens(org_id, id) on delete cascade
);

create table public.deck_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  deck_id uuid not null,
  menu_version_id uuid not null,
  status public.approval_status not null default 'draft',
  manifest_json jsonb not null,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, deck_id) references public.slide_decks(org_id, id) on delete cascade,
  foreign key (org_id, menu_version_id) references public.menu_versions(org_id, id) on delete restrict
);

alter table public.slide_decks
  add constraint slide_decks_published_version_fk
  foreign key (org_id, published_deck_version_id) references public.deck_versions(org_id, id);

create table public.slides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  deck_version_id uuid not null,
  template_version_id uuid not null,
  title text not null,
  manifest_json jsonb not null,
  sort_order integer not null default 0,
  foreign key (org_id, deck_version_id) references public.deck_versions(org_id, id) on delete cascade,
  foreign key (org_id, template_version_id) references public.template_versions(org_id, id) on delete restrict
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  generation_type text not null,
  model text not null,
  prompt text not null,
  input_hash text,
  output_asset_id uuid,
  output_json jsonb,
  cost_czk numeric(12, 2),
  status text not null default 'succeeded',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, output_asset_id) references public.assets(org_id, id) on delete set null
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  target_version_id uuid not null,
  status public.approval_status not null default 'needs_review',
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  approver_id uuid references public.profiles(id),
  decision public.approval_status not null default 'needs_review',
  comment text,
  decided_at timestamptz
);

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  deck_version_id uuid not null,
  status public.render_job_status not null default 'queued',
  job_type text not null,
  idempotency_key text not null,
  progress integer not null default 0 check (progress between 0 and 100),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  worker_id text,
  last_heartbeat_at timestamptz,
  error_message text,
  output_asset_id uuid,
  ffprobe_json jsonb,
  renderer_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, idempotency_key),
  foreign key (org_id, deck_version_id) references public.deck_versions(org_id, id) on delete cascade,
  foreign key (org_id, output_asset_id) references public.assets(org_id, id) on delete set null
);

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  render_job_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (org_id, render_job_id) references public.render_jobs(org_id, id) on delete cascade
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  deck_version_id uuid not null,
  render_job_id uuid,
  format text not null default 'mp4',
  bucket text not null,
  object_path text not null,
  checksum text not null,
  size_bytes bigint,
  duration_seconds numeric(8, 2),
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, deck_version_id) references public.deck_versions(org_id, id) on delete cascade,
  foreign key (org_id, render_job_id) references public.render_jobs(org_id, id) on delete set null
);

create table public.publish_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  screen_id uuid not null,
  deck_version_id uuid not null,
  export_id uuid,
  published_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, screen_id) references public.screens(org_id, id) on delete cascade,
  foreign key (org_id, deck_version_id) references public.deck_versions(org_id, id) on delete restrict,
  foreign key (org_id, export_id) references public.exports(org_id, id) on delete set null
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  request_id text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  usage_type text not null,
  provider text not null,
  model text,
  quantity numeric(14, 4) not null default 0,
  cost_czk numeric(12, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.is_org_member(target_org_id uuid, allowed_roles public.org_role[] default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
      and membership.active = true
      and (allowed_roles is null or membership.role = any(allowed_roles))
  );
$$;

create or replace function private.can_access_location(target_org_id uuid, target_location_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select private.is_org_member(target_org_id, null)
    and (
      not exists (
        select 1
        from public.membership_location_scopes scope
        where scope.org_id = target_org_id
          and scope.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.membership_location_scopes scope
        where scope.org_id = target_org_id
          and scope.user_id = auth.uid()
          and scope.location_id = target_location_id
      )
    );
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations',
    'profiles',
    'org_memberships',
    'locations',
    'canteens',
    'membership_location_scopes',
    'screens',
    'screen_tokens',
    'allergens',
    'menu_sources',
    'menus',
    'menu_versions',
    'menu_entries',
    'assets',
    'templates',
    'template_versions',
    'slide_decks',
    'deck_versions',
    'slides',
    'ai_generations',
    'approval_requests',
    'approval_steps',
    'render_jobs',
    'job_events',
    'exports',
    'publish_events',
    'audit_log',
    'usage_ledger'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy "members can read organizations"
on public.organizations for select
to authenticated
using (private.is_org_member(id, null));

create policy "members can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "members can read org memberships"
on public.org_memberships for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "admins can manage org memberships"
on public.org_memberships for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin']::public.org_role[]));

create policy "members read allergens"
on public.allergens for select
to authenticated
using (true);

create policy "members read tenant tables"
on public.locations for select
to authenticated
using (private.can_access_location(org_id, id));

create policy "members read canteens"
on public.canteens for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "members read screens"
on public.screens for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "editors manage menu sources"
on public.menu_sources for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[]));

create policy "members read menus"
on public.menus for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "editors manage menus"
on public.menus for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[]));

create policy "members read menu versions"
on public.menu_versions for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "editors insert menu versions"
on public.menu_versions for insert
to authenticated
with check (private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[]));

create policy "members read version children"
on public.menu_entries for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "members read assets"
on public.assets for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "editors manage assets"
on public.assets for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[]));

create policy "members read deck data"
on public.slide_decks for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "editors manage deck data"
on public.slide_decks for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[]));

create policy "members read deck versions"
on public.deck_versions for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "editors insert deck versions"
on public.deck_versions for insert
to authenticated
with check (private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[]));

create policy "members read operational logs"
on public.render_jobs for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "publishers manage render jobs"
on public.render_jobs for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'publisher']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'publisher']::public.org_role[]));

insert into storage.buckets (id, name, public)
values
  ('source-uploads', 'source-uploads', false),
  ('generated-assets', 'generated-assets', false),
  ('template-previews', 'template-previews', false),
  ('render-artifacts', 'render-artifacts', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "authenticated users read private org storage"
on storage.objects for select
to authenticated
using (
  bucket_id in ('source-uploads', 'generated-assets', 'template-previews', 'exports')
);

create policy "authenticated users upload allowed private objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('source-uploads', 'generated-assets', 'template-previews')
);
