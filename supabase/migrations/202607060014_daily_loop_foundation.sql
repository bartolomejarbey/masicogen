-- Denní 6slidová smyčka: knihovna fotek jídel, našeptávač z historie,
-- deck z manifestu stavěného v TypeScriptu a spuštění i pro roli publisher.

create extension if not exists pg_trgm;

-- Normalizace názvu jídla bez závislosti na unaccent (immutable kvůli
-- generovanému sloupci a indexům): malá písmena, bez diakritiky, bez interpunkce.
create or replace function private.normalize_dish_name(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(value, '')),
        'áčďéěíňóřšťúůýžäöüàâêîôľĺćśź',
        'acdeeinorstuuyzaouaaeioollcsz'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  )
$$;

create table public.dish_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  canteen_id uuid,
  asset_id uuid not null,
  dish_name text not null,
  dish_name_normalized text generated always as (private.normalize_dish_name(dish_name)) stored,
  focal_point jsonb not null default '{"x": 0.5, "y": 0.5}'::jsonb,
  is_default boolean not null default true,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, asset_id) references public.assets(org_id, id) on delete cascade,
  foreign key (org_id, canteen_id) references public.canteens(org_id, id) on delete cascade,
  unique (org_id, dish_name_normalized, asset_id)
);

create index dish_photos_name_trgm
  on public.dish_photos
  using gin (dish_name_normalized gin_trgm_ops);

create index dish_photos_org_default
  on public.dish_photos (org_id, dish_name_normalized)
  where is_default;

alter table public.dish_photos enable row level security;

create policy "members read dish photos"
on public.dish_photos for select
to authenticated
using (private.is_org_member(org_id, null));

create policy "staff manage dish photos"
on public.dish_photos for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer', 'publisher']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer', 'publisher']::public.org_role[]));

-- Našeptávač potřebuje rychlé fuzzy hledání v historii jídel.
create index menu_entries_display_name_trgm
  on public.menu_entries
  using gin (display_name gin_trgm_ops);

insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', false)
on conflict (id) do nothing;

create policy "members read dish photos storage"
on storage.objects for select
to authenticated
using (
  bucket_id = 'dish-photos'
  and private.storage_org_id(name) is not null
  and private.is_org_member(private.storage_org_id(name), null)
);

create policy "staff upload dish photos storage"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'dish-photos'
  and private.storage_org_id(name) is not null
  and private.is_org_member(
    private.storage_org_id(name),
    array['owner', 'admin', 'editor', 'designer', 'publisher']::public.org_role[]
  )
);

-- Registrace fotky jídla: jedna výchozí fotka na normalizovaný název.
create or replace function public.register_dish_photo(
  target_org_id uuid,
  target_asset_id uuid,
  target_dish_name text,
  target_canteen_id uuid default null,
  target_focal_point jsonb default '{"x": 0.5, "y": 0.5}'::jsonb
)
returns table (
  dish_photo_id uuid,
  dish_name_normalized text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  normalized text := private.normalize_dish_name(target_dish_name);
  photo_row public.dish_photos%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not private.is_org_member(target_org_id, array['owner', 'admin', 'editor', 'designer', 'publisher']::public.org_role[]) then
    raise exception 'Staff role required' using errcode = '42501';
  end if;

  if normalized is null or length(normalized) = 0 then
    raise exception 'Dish name is required' using errcode = '23502';
  end if;

  if length(target_dish_name) > 160 then
    raise exception 'Dish name is too long' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.assets
    where org_id = target_org_id and id = target_asset_id and type = 'image'
  ) then
    raise exception 'Dish photo asset not found' using errcode = 'P0002';
  end if;

  update public.dish_photos
  set is_default = false
  where org_id = target_org_id
    and dish_name_normalized = normalized
    and asset_id <> target_asset_id;

  insert into public.dish_photos (org_id, canteen_id, asset_id, dish_name, focal_point, is_default, created_by)
  values (target_org_id, target_canteen_id, target_asset_id, target_dish_name, coalesce(target_focal_point, '{"x": 0.5, "y": 0.5}'::jsonb), true, actor_id)
  on conflict (org_id, dish_name_normalized, asset_id)
  do update set
    is_default = true,
    focal_point = excluded.focal_point,
    last_used_at = now()
  returning * into photo_row;

  return query select photo_row.id, photo_row.dish_name_normalized;
end;
$$;

revoke all on function public.register_dish_photo(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.register_dish_photo(uuid, uuid, text, uuid, jsonb) to authenticated;

-- Našeptávač jídel z historie: název + poslední cena + alergeny + výchozí fotka.
create or replace function public.suggest_dishes(
  target_org_id uuid,
  target_canteen_id uuid,
  search_text text,
  target_section_id text default null,
  result_limit integer default 8
)
returns table (
  display_name text,
  price_czk integer,
  allergen_codes text[],
  photo_asset_id uuid,
  photo_focal_point jsonb,
  times_used bigint,
  last_menu_date date
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  normalized_search text := private.normalize_dish_name(search_text);
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not private.is_org_member(target_org_id, null) then
    raise exception 'Membership required' using errcode = '42501';
  end if;

  if normalized_search is null or length(normalized_search) < 2 then
    return;
  end if;

  return query
  with history as (
    select
      me.display_name,
      me.price_czk,
      me.allergen_codes,
      m.menu_date,
      private.normalize_dish_name(me.display_name) as normalized_name,
      row_number() over (
        partition by private.normalize_dish_name(me.display_name)
        order by m.menu_date desc, me.sort_order asc
      ) as recency_rank,
      count(*) over (partition by private.normalize_dish_name(me.display_name)) as usage_count
    from public.menu_entries me
    join public.menu_versions mv on mv.org_id = me.org_id and mv.id = me.menu_version_id
    join public.menus m on m.org_id = mv.org_id and m.id = mv.menu_id
    where me.org_id = target_org_id
      and m.canteen_id = target_canteen_id
      and (target_section_id is null or me.section_id = target_section_id)
      and private.normalize_dish_name(me.display_name) like normalized_search || '%'
  )
  select
    h.display_name,
    h.price_czk,
    h.allergen_codes,
    dp.asset_id,
    dp.focal_point,
    h.usage_count,
    h.menu_date
  from history h
  left join lateral (
    select asset_id, focal_point
    from public.dish_photos
    where org_id = target_org_id
      and dish_name_normalized = h.normalized_name
    order by is_default desc, last_used_at desc nulls last
    limit 1
  ) dp on true
  where h.recency_rank = 1
  order by h.usage_count desc, h.menu_date desc
  limit least(greatest(result_limit, 1), 20);
end;
$$;

revoke all on function public.suggest_dishes(uuid, uuid, text, text, integer) from public;
grant execute on function public.suggest_dishes(uuid, uuid, text, text, integer) to authenticated;

-- Deck z manifestu stavěného v TypeScriptu (deck-builder): RPC pouze validuje,
-- verzuje šablony podle obsahu a vkládá řádky. Nahrazuje zadrátované 3 slidy
-- z create_tv_deck_from_menu_version; stará RPC zůstává pro zpětnou kompatibilitu.
create or replace function public.create_tv_deck_from_manifest(
  target_menu_version_id uuid,
  deck_manifest jsonb
)
returns table (
  org_id uuid,
  deck_id uuid,
  deck_version_id uuid,
  menu_version_id uuid,
  status public.approval_status
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  version_row public.menu_versions%rowtype;
  menu_row public.menus%rowtype;
  deck_row public.slide_decks%rowtype;
  deck_version_row public.deck_versions%rowtype;
  slide_item jsonb;
  slide_count integer;
  duration_frames integer;
  template_slug text;
  template_manifest jsonb;
  template_row_id uuid;
  latest_version integer;
  latest_manifest jsonb;
  template_version_id uuid;
  version_map jsonb := '{}'::jsonb;
  version_ids jsonb := '[]'::jsonb;
  asset_id_text text;
  final_manifest jsonb;
  sort_index integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into version_row
  from public.menu_versions
  where id = target_menu_version_id
  for update;

  if not found then
    raise exception 'Menu version not found' using errcode = 'P0002';
  end if;

  if not private.is_org_member(
    version_row.org_id,
    array['owner', 'admin', 'editor', 'designer', 'publisher']::public.org_role[]
  ) then
    raise exception 'Staff role required' using errcode = '42501';
  end if;

  select *
  into menu_row
  from public.menus
  where org_id = version_row.org_id
    and id = version_row.menu_id;

  if not found then
    raise exception 'Menu not found' using errcode = 'P0002';
  end if;

  if not private.can_access_location(version_row.org_id, menu_row.location_id) then
    raise exception 'Location access required' using errcode = '42501';
  end if;

  if jsonb_typeof(deck_manifest) <> 'object'
    or jsonb_typeof(deck_manifest->'slides') <> 'array'
    or jsonb_typeof(deck_manifest->'templateManifests') <> 'object' then
    raise exception 'Deck manifest must contain slides and templateManifests' using errcode = '22023';
  end if;

  select count(*) into slide_count from jsonb_array_elements(deck_manifest->'slides');
  if slide_count = 0 or slide_count > 12 then
    raise exception 'Deck manifest has unsupported slide count' using errcode = '22023';
  end if;

  if (deck_manifest#>>'{canvas,width}')::integer is distinct from 1920
    or (deck_manifest#>>'{canvas,height}')::integer is distinct from 1080 then
    raise exception 'Deck manifest has unsupported canvas' using errcode = '22023';
  end if;

  -- Délky slidů: 3 až 60 sekund (90 až 1800 framů při 30 fps).
  for slide_item in select value from jsonb_array_elements(deck_manifest->'slides')
  loop
    duration_frames := coalesce((slide_item->>'durationFrames')::integer, 0);
    if duration_frames < 90 or duration_frames > 1800 then
      raise exception 'Slide duration out of range (3-60 s)' using errcode = '22023';
    end if;

    template_slug := slide_item->>'templateId';
    if template_slug is null or deck_manifest->'templateManifests'->template_slug is null then
      raise exception 'Slide references missing template manifest' using errcode = '22023';
    end if;
  end loop;

  -- Fotky a pozadí musí být existující assety této organizace.
  for asset_id_text in
    select jsonb_array_elements_text(coalesce(deck_manifest->'assetIds', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.assets
      where org_id = version_row.org_id and id = asset_id_text::uuid and type = 'image'
    ) then
      raise exception 'Deck manifest references unknown asset %', asset_id_text using errcode = 'P0002';
    end if;
  end loop;

  -- Verzování šablon podle obsahu: stejný manifest -> stejná verze,
  -- změněný manifest -> nová immutable verze + posun current_version_id.
  for template_slug in
    select distinct value->>'templateId' from jsonb_array_elements(deck_manifest->'slides')
  loop
    template_manifest := deck_manifest->'templateManifests'->template_slug;

    insert into public.templates (org_id, slug, name, kind)
    values (
      version_row.org_id,
      template_slug,
      coalesce(template_manifest->>'name', template_slug),
      coalesce(template_manifest->>'templateKind', 'daily_menu')
    )
    on conflict (org_id, slug) do update set name = excluded.name
    returning id into template_row_id;

    if template_row_id is null then
      select id into template_row_id
      from public.templates
      where org_id = version_row.org_id and slug = template_slug;
    end if;

    select tv.version, tv.manifest_json
    into latest_version, latest_manifest
    from public.template_versions tv
    where tv.org_id = version_row.org_id
      and tv.template_id = template_row_id
    order by tv.version desc
    limit 1;

    if latest_manifest is not null and latest_manifest = template_manifest then
      select tv.id into template_version_id
      from public.template_versions tv
      where tv.org_id = version_row.org_id
        and tv.template_id = template_row_id
        and tv.version = latest_version;
    else
      insert into public.template_versions (org_id, template_id, version, manifest_json, created_by)
      values (
        version_row.org_id,
        template_row_id,
        coalesce(latest_version, 0) + 1,
        template_manifest,
        actor_id
      )
      returning id into template_version_id;
    end if;

    update public.templates
    set current_version_id = template_version_id
    where org_id = version_row.org_id and id = template_row_id;

    version_map := version_map || jsonb_build_object(template_slug, template_version_id::text);
    version_ids := version_ids || to_jsonb(template_version_id::text);
  end loop;

  insert into public.slide_decks (org_id, location_id, canteen_id, name)
  values (
    version_row.org_id,
    menu_row.location_id,
    menu_row.canteen_id,
    'TV smyčka ' || menu_row.menu_date::text
  )
  returning * into deck_row;

  final_manifest := deck_manifest
    || jsonb_build_object(
      'id', deck_row.id,
      'orgId', version_row.org_id,
      'locationId', menu_row.location_id,
      'canteenId', menu_row.canteen_id,
      'menuVersionId', version_row.id,
      'status', 'draft',
      'templateVersionIds', version_ids
    );

  insert into public.deck_versions (
    org_id,
    deck_id,
    menu_version_id,
    status,
    manifest_json,
    created_by
  )
  values (
    version_row.org_id,
    deck_row.id,
    version_row.id,
    'draft',
    final_manifest,
    actor_id
  )
  returning * into deck_version_row;

  for slide_item in select value from jsonb_array_elements(deck_manifest->'slides')
  loop
    sort_index := sort_index + 1;

    insert into public.slides (org_id, deck_version_id, template_version_id, title, manifest_json, sort_order)
    values (
      version_row.org_id,
      deck_version_row.id,
      (version_map->>(slide_item->>'templateId'))::uuid,
      coalesce(slide_item->>'title', 'Slide ' || sort_index::text),
      slide_item,
      sort_index
    );
  end loop;

  -- Statistika použití fotek pro řazení knihovny.
  update public.dish_photos
  set use_count = use_count + 1,
      last_used_at = now()
  where org_id = version_row.org_id
    and asset_id in (
      select (jsonb_array_elements_text(coalesce(deck_manifest->'assetIds', '[]'::jsonb)))::uuid
    );

  insert into public.audit_log (
    org_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_json
  )
  values (
    version_row.org_id,
    actor_id,
    'create_tv_deck_from_manifest',
    'deck_version',
    deck_version_row.id,
    jsonb_build_object(
      'deck_id', deck_row.id,
      'deck_version_id', deck_version_row.id,
      'menu_version_id', version_row.id,
      'slide_count', slide_count,
      'template_versions', version_map
    )
  );

  return query select version_row.org_id, deck_row.id, deck_version_row.id, version_row.id, deck_version_row.status;
end;
$$;

revoke all on function public.create_tv_deck_from_manifest(uuid, jsonb) from public;
grant execute on function public.create_tv_deck_from_manifest(uuid, jsonb) to authenticated;

-- Denní provoz obsluhuje kuchařka s rolí publisher: musí projít i schválením
-- (potvrzení v UI je lidská kontrola). Funkce jsou převzaté z migrace 0003,
-- mění se jen množina rolí.
create or replace function public.approve_menu_version(
  target_menu_version_id uuid,
  approval_comment text default null
)
returns table (
  menu_version_id uuid,
  approval_request_id uuid,
  approval_step_id uuid,
  status public.approval_status,
  approved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  version_before public.menu_versions%rowtype;
  version_after public.menu_versions%rowtype;
  request_id uuid;
  step_id uuid;
  approved_time timestamptz := now();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into version_before
  from public.menu_versions
  where id = target_menu_version_id
  for update;

  if not found then
    raise exception 'Menu version not found' using errcode = 'P0002';
  end if;

  if not private.is_org_member(version_before.org_id, array['owner', 'admin', 'approver', 'publisher']::public.org_role[]) then
    raise exception 'Approver role required' using errcode = '42501';
  end if;

  if version_before.status in ('approved', 'published') then
    raise exception 'Menu version is already final' using errcode = '23514';
  end if;

  insert into public.approval_requests (
    org_id,
    target_type,
    target_id,
    target_version_id,
    status,
    requested_by
  )
  values (
    version_before.org_id,
    'menu_version',
    version_before.menu_id,
    version_before.id,
    'approved',
    actor_id
  )
  returning id into request_id;

  insert into public.approval_steps (
    org_id,
    approval_request_id,
    approver_id,
    decision,
    comment,
    decided_at
  )
  values (
    version_before.org_id,
    request_id,
    actor_id,
    'approved',
    approval_comment,
    approved_time
  )
  returning id into step_id;

  update public.menu_versions
  set status = 'approved',
      approved_by = actor_id,
      approved_at = approved_time
  where org_id = version_before.org_id
    and id = version_before.id
  returning * into version_after;

  update public.menus
  set status = 'approved',
      current_version_id = version_before.id
  where org_id = version_before.org_id
    and id = version_before.menu_id;

  insert into public.audit_log (
    org_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  )
  values (
    version_before.org_id,
    actor_id,
    'approve_menu_version',
    'menu_version',
    version_before.id,
    to_jsonb(version_before),
    jsonb_build_object(
      'version', to_jsonb(version_after),
      'approval_request_id', request_id,
      'approval_step_id', step_id,
      'comment', approval_comment
    )
  );

  return query select version_after.id, request_id, step_id, version_after.status, version_after.approved_at;
end;
$$;

create or replace function public.approve_deck_version(
  target_deck_version_id uuid,
  approval_comment text default null
)
returns table (
  deck_version_id uuid,
  approval_request_id uuid,
  approval_step_id uuid,
  status public.approval_status,
  approved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  version_before public.deck_versions%rowtype;
  version_after public.deck_versions%rowtype;
  menu_version public.menu_versions%rowtype;
  request_id uuid;
  step_id uuid;
  approved_time timestamptz := now();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into version_before
  from public.deck_versions
  where id = target_deck_version_id
  for update;

  if not found then
    raise exception 'Deck version not found' using errcode = 'P0002';
  end if;

  if not private.is_org_member(version_before.org_id, array['owner', 'admin', 'approver', 'publisher']::public.org_role[]) then
    raise exception 'Approver role required' using errcode = '42501';
  end if;

  if version_before.status in ('approved', 'published') then
    raise exception 'Deck version is already final' using errcode = '23514';
  end if;

  select *
  into menu_version
  from public.menu_versions
  where org_id = version_before.org_id
    and id = version_before.menu_version_id;

  if not found or menu_version.status not in ('approved', 'published') then
    raise exception 'Menu version must be approved before deck approval' using errcode = '23514';
  end if;

  insert into public.approval_requests (
    org_id,
    target_type,
    target_id,
    target_version_id,
    status,
    requested_by
  )
  values (
    version_before.org_id,
    'deck_version',
    version_before.deck_id,
    version_before.id,
    'approved',
    actor_id
  )
  returning id into request_id;

  insert into public.approval_steps (
    org_id,
    approval_request_id,
    approver_id,
    decision,
    comment,
    decided_at
  )
  values (
    version_before.org_id,
    request_id,
    actor_id,
    'approved',
    approval_comment,
    approved_time
  )
  returning id into step_id;

  update public.deck_versions
  set status = 'approved',
      approved_by = actor_id,
      approved_at = approved_time
  where org_id = version_before.org_id
    and id = version_before.id
  returning * into version_after;

  insert into public.audit_log (
    org_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  )
  values (
    version_before.org_id,
    actor_id,
    'approve_deck_version',
    'deck_version',
    version_before.id,
    to_jsonb(version_before),
    jsonb_build_object(
      'version', to_jsonb(version_after),
      'menu_version_id', menu_version.id,
      'approval_request_id', request_id,
      'approval_step_id', step_id,
      'comment', approval_comment
    )
  );

  return query select version_after.id, request_id, step_id, version_after.status, version_after.approved_at;
end;
$$;

-- Import menu smí spustit i publisher (denní provoz kuchařky).
-- Funkce převzatá z migrace 0009, mění se jen množina rolí.
create or replace function public.import_text_menu_version(
  target_org_id uuid,
  target_location_id uuid,
  target_canteen_id uuid,
  target_menu_date date,
  source_text text,
  extraction_snapshot jsonb
)
returns table (
  org_id uuid,
  menu_id uuid,
  menu_version_id uuid,
  source_id uuid,
  menu_date date,
  status public.approval_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  canteen_row public.canteens%rowtype;
  menu_row public.menus%rowtype;
  source_row public.menu_sources%rowtype;
  version_row public.menu_versions%rowtype;
  section_item jsonb;
  menu_item jsonb;
  section_index integer := 0;
  item_index integer := 0;
  section_count integer := 0;
  entry_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if target_org_id is null then
    raise exception 'Organization is required' using errcode = '23502';
  end if;

  if target_menu_date is null then
    raise exception 'Menu date is required' using errcode = '23502';
  end if;

  if source_text is null or length(trim(source_text)) = 0 then
    raise exception 'Source text is required' using errcode = '23502';
  end if;

  if length(source_text) > 20000 then
    raise exception 'Source text is too long' using errcode = '22023';
  end if;

  if jsonb_typeof(extraction_snapshot) <> 'object'
    or jsonb_typeof(extraction_snapshot->'sections') <> 'array' then
    raise exception 'Extraction snapshot must contain sections array' using errcode = '22023';
  end if;

  select count(*)
  into section_count
  from jsonb_array_elements(extraction_snapshot->'sections');

  select count(*)
  into entry_count
  from jsonb_array_elements(extraction_snapshot->'sections') as sections(section_value)
  cross join lateral jsonb_array_elements(coalesce(sections.section_value->'items', '[]'::jsonb)) as items(item_value);

  if section_count = 0 or section_count > 12 then
    raise exception 'Extraction snapshot has unsupported section count' using errcode = '22023';
  end if;

  if entry_count = 0 or entry_count > 80 then
    raise exception 'Extraction snapshot has unsupported item count' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(extraction_snapshot->'sections') with ordinality as sections(section_value, section_ordinal)
    cross join lateral jsonb_array_elements(coalesce(sections.section_value->'items', '[]'::jsonb)) with ordinality as items(item_value, item_ordinal)
    where length(coalesce(items.item_value->>'name', '')) > 160
       or length(coalesce(items.item_value->>'shortName', '')) > 80
       or length(coalesce(items.item_value->>'description', '')) > 280
  ) then
    raise exception 'Extraction snapshot contains unsupported text length' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(extraction_snapshot->'sections') with ordinality as sections(section_value, section_ordinal)
    cross join lateral jsonb_array_elements(coalesce(sections.section_value->'items', '[]'::jsonb)) with ordinality as items(item_value, item_ordinal)
    group by
      coalesce(sections.section_value->>'id', 'section-' || (sections.section_ordinal - 1)::text),
      coalesce(items.item_value->>'id', 'item-' || (sections.section_ordinal - 1)::text || '-' || (items.item_ordinal - 1)::text)
    having count(*) > 1
  ) then
    raise exception 'Extraction snapshot contains duplicate menu item ids' using errcode = '22023';
  end if;

  select c.*
  into canteen_row
  from public.canteens as c
  where c.id = target_canteen_id
    and c.org_id = target_org_id
    and c.location_id = target_location_id;

  if not found then
    raise exception 'Import target not permitted' using errcode = '42501';
  end if;

  if not private.is_org_member(canteen_row.org_id, array['owner', 'admin', 'editor', 'publisher']::public.org_role[])
    or not private.can_access_location(canteen_row.org_id, target_location_id) then
    raise exception 'Import target not permitted' using errcode = '42501';
  end if;

  insert into public.menu_sources (
    org_id,
    location_id,
    canteen_id,
    uploaded_by,
    bucket,
    object_path,
    mime_type,
    original_file_name,
    status,
    extracted_text
  )
  values (
    canteen_row.org_id,
    target_location_id,
    target_canteen_id,
    actor_id,
    'source-uploads',
    'org/' || canteen_row.org_id::text || '/text-imports/' || gen_random_uuid()::text || '.txt',
    'text/plain',
    'paste-menu-' || target_menu_date::text || '.txt',
    'extracted',
    source_text
  )
  returning * into source_row;

  insert into public.menus (
    org_id,
    location_id,
    canteen_id,
    menu_date,
    status
  )
  values (
    canteen_row.org_id,
    target_location_id,
    target_canteen_id,
    target_menu_date,
    'draft'
  )
  on conflict on constraint menus_org_id_canteen_id_menu_date_key
  do update set
    location_id = excluded.location_id,
    status = 'draft'
  returning * into menu_row;

  insert into public.menu_versions (
    org_id,
    menu_id,
    source_id,
    status,
    extraction_model,
    extraction_prompt_version,
    snapshot,
    created_by
  )
  values (
    canteen_row.org_id,
    menu_row.id,
    source_row.id,
    'draft',
    'local-text-parser',
    'paste-v1',
    extraction_snapshot,
    actor_id
  )
  returning * into version_row;

  for section_item in
    select section_value.value
    from jsonb_array_elements(extraction_snapshot->'sections') as section_value(value)
  loop
    item_index := 0;

    for menu_item in
      select item_value.value
      from jsonb_array_elements(coalesce(section_item->'items', '[]'::jsonb)) as item_value(value)
    loop
      insert into public.menu_entries (
        org_id,
        menu_version_id,
        section_id,
        section_name,
        item_id,
        display_name,
        short_name,
        description,
        price_czk,
        allergen_codes,
        allergens_unknown,
        available,
        highlight,
        sort_order
      )
      values (
        canteen_row.org_id,
        version_row.id,
        coalesce(section_item->>'id', 'section-' || section_index::text),
        coalesce(section_item->>'name', 'Sekce'),
        coalesce(menu_item->>'id', 'item-' || section_index::text || '-' || item_index::text),
        coalesce(nullif(menu_item->>'name', ''), 'Položka k doplnění'),
        nullif(menu_item->>'shortName', ''),
        nullif(menu_item->>'description', ''),
        case
          when coalesce(menu_item#>>'{prices,0,amount}', '') ~ '^\d+(\.0+)?$'
            then (menu_item#>>'{prices,0,amount}')::numeric::integer
          else null
        end,
        coalesce(
          array(
            select jsonb_array_elements_text(coalesce(menu_item->'allergens', '[]'::jsonb))
          ),
          '{}'
        ),
        coalesce((menu_item->>'allergensUnknown')::boolean, true),
        coalesce((menu_item->>'available')::boolean, true),
        coalesce((menu_item->>'highlight')::boolean, false),
        (section_index * 1000) + item_index
      );

      item_index := item_index + 1;
    end loop;

    section_index := section_index + 1;
  end loop;

  update public.menus as m
  set current_version_id = version_row.id,
      status = 'draft'
  where m.org_id = canteen_row.org_id
    and m.id = menu_row.id
  returning m.* into menu_row;

  insert into public.audit_log (
    org_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_json
  )
  values (
    canteen_row.org_id,
    actor_id,
    'import_text_menu_version',
    'menu_version',
    version_row.id,
    jsonb_build_object(
      'menu_id', menu_row.id,
      'menu_version_id', version_row.id,
      'source_id', source_row.id,
      'menu_date', target_menu_date,
      'location_id', target_location_id,
      'canteen_id', target_canteen_id
    )
  );

  return query
    select
      canteen_row.org_id,
      menu_row.id,
      version_row.id,
      source_row.id,
      menu_row.menu_date,
      version_row.status;
end;
$$;

revoke all on function public.import_text_menu_version(uuid, uuid, uuid, date, text, jsonb) from public;
grant execute on function public.import_text_menu_version(uuid, uuid, uuid, date, text, jsonb) to authenticated;
