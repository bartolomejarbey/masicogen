-- Autopilot: provozní log automatik, fronta AI fotek jídel, nastavení
-- organizace, atomický týdenní import a guard + logování pull-publish.

-- Provozní log automatik. Zapisuje výhradně service role a security-definer
-- funkce; členové organizace čtou. dedupe_key kryje idempotenci cronů
-- i anti-spam logování pull-publish (1 zápis na screen a den).
create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  canteen_id uuid,
  run_type text not null check (
    run_type in ('pull_publish', 'week_extract', 'dish_photo', 'deck_prepare', 'morning_check', 'render')
  ),
  entity_type text,
  entity_id uuid,
  status text not null check (status in ('succeeded', 'skipped', 'failed', 'degraded')),
  error_code text,
  error_message text,
  detail jsonb not null default '{}'::jsonb,
  attempts integer not null default 1,
  dedupe_key text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (org_id, dedupe_key),
  foreign key (org_id, canteen_id) references public.canteens(org_id, id) on delete cascade
);

create index automation_runs_org_started
  on public.automation_runs (org_id, started_at desc);

alter table public.automation_runs enable row level security;

create policy "members read automation runs"
on public.automation_runs for select
to authenticated
using (private.is_org_member(org_id, null));

-- Původ fotky jídla: lidský upload, výřez, nebo AI generace.
alter table public.dish_photos
  add column source text not null default 'upload'
  check (source in ('upload', 'cutout', 'ai'));

-- Fronta generování AI fotek jídel. Zapisuje jen service role a definer
-- funkce; partial unique brání duplicitním aktivním jobům na stejné jídlo.
create table public.dish_photo_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  canteen_id uuid,
  dish_name text not null,
  dish_name_normalized text generated always as (private.normalize_dish_name(dish_name)) stored,
  description text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error_message text,
  result_photo_id uuid references public.dish_photos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, canteen_id) references public.canteens(org_id, id) on delete cascade
);

create unique index dish_photo_jobs_active_uq
  on public.dish_photo_jobs (org_id, dish_name_normalized)
  where status in ('queued', 'processing');

-- Denní limit se počítá přes created_at, sweep hledá podle statusu.
create index dish_photo_jobs_org_created
  on public.dish_photo_jobs (org_id, created_at desc);

alter table public.dish_photo_jobs enable row level security;

create policy "members read dish photo jobs"
on public.dish_photo_jobs for select
to authenticated
using (private.is_org_member(org_id, null));

-- Nastavení organizace: mělký merge per top-level klíč do organizations.settings.
-- Whitelist klíčů drží strukturu v souladu s orgSettingsSchema v packages/shared.
create or replace function public.update_org_settings(
  target_org_id uuid,
  settings_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  settings_before jsonb;
  settings_after jsonb;
  section_before jsonb;
  patch_key text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not private.is_org_member(target_org_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if settings_patch is null or jsonb_typeof(settings_patch) <> 'object' then
    raise exception 'Settings patch must be an object' using errcode = '22023';
  end if;

  if length(settings_patch::text) > 20000 then
    raise exception 'Settings patch is too large' using errcode = '22023';
  end if;

  -- Typová kontrola hodnot, na kterých závisí automatiky — špatný typ by
  -- později shodil auto_publish_due_deck / enqueue_missing_dish_photos.
  if settings_patch ? 'automation' then
    if settings_patch->'automation' ? 'autoPublish'
      and jsonb_typeof(settings_patch->'automation'->'autoPublish') <> 'boolean' then
      raise exception 'automation.autoPublish must be a boolean' using errcode = '22023';
    end if;
    if settings_patch->'automation' ? 'aiPhotos' then
      if jsonb_typeof(settings_patch->'automation'->'aiPhotos') <> 'object' then
        raise exception 'automation.aiPhotos must be an object' using errcode = '22023';
      end if;
      if settings_patch->'automation'->'aiPhotos' ? 'enabled'
        and jsonb_typeof(settings_patch->'automation'->'aiPhotos'->'enabled') <> 'boolean' then
        raise exception 'automation.aiPhotos.enabled must be a boolean' using errcode = '22023';
      end if;
      if settings_patch->'automation'->'aiPhotos' ? 'dailyLimit'
        and jsonb_typeof(settings_patch->'automation'->'aiPhotos'->'dailyLimit') <> 'number' then
        raise exception 'automation.aiPhotos.dailyLimit must be a number' using errcode = '22023';
      end if;
    end if;
  end if;

  for patch_key in select jsonb_object_keys(settings_patch)
  loop
    if patch_key not in ('loop', 'content', 'branding', 'automation', 'export') then
      raise exception 'Unknown settings key %', patch_key using errcode = '22023';
    end if;

    if jsonb_typeof(settings_patch->patch_key) <> 'object' then
      raise exception 'Settings section % must be an object', patch_key using errcode = '22023';
    end if;
  end loop;

  select settings
  into settings_before
  from public.organizations
  where id = target_org_id
  for update;

  if not found then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  settings_after := coalesce(settings_before, '{}'::jsonb);

  for patch_key in select jsonb_object_keys(settings_patch)
  loop
    section_before := settings_after->patch_key;
    if section_before is null or jsonb_typeof(section_before) <> 'object' then
      section_before := '{}'::jsonb;
    end if;

    settings_after := jsonb_set(
      settings_after,
      array[patch_key],
      section_before || (settings_patch->patch_key),
      true
    );
  end loop;

  update public.organizations
  set settings = settings_after,
      updated_at = now()
  where id = target_org_id;

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
    target_org_id,
    actor_id,
    'update_org_settings',
    'organization',
    target_org_id,
    jsonb_build_object('settings', settings_before),
    jsonb_build_object('settings', settings_after, 'patch', settings_patch)
  );

  return settings_after;
end;
$$;

revoke all on function public.update_org_settings(uuid, jsonb) from public;
grant execute on function public.update_org_settings(uuid, jsonb) to authenticated;

-- Atomický import celého týdne: jeden zdroj (nahraný lístek), pro každý den
-- upsert menu + draft verze + entries. Datumy počítá TypeScript z weekStart,
-- nikdy LLM. Chyba kdekoli = rollback všeho.
create or replace function public.import_week_from_source(
  target_org_id uuid,
  target_location_id uuid,
  target_canteen_id uuid,
  week_start date,
  source_bucket text,
  source_path text,
  source_mime text,
  days jsonb
)
returns table (
  menu_date date,
  menu_id uuid,
  menu_version_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  canteen_row public.canteens%rowtype;
  source_row public.menu_sources%rowtype;
  menu_row public.menus%rowtype;
  version_row public.menu_versions%rowtype;
  day_item jsonb;
  day_date date;
  extraction_snapshot jsonb;
  section_item jsonb;
  menu_item jsonb;
  section_index integer;
  item_index integer;
  day_count integer;
  section_count integer;
  entry_count integer;
  version_ids jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if target_org_id is null or week_start is null then
    raise exception 'Organization and week start are required' using errcode = '23502';
  end if;

  if coalesce(trim(source_bucket), '') = ''
    or coalesce(trim(source_path), '') = ''
    or coalesce(trim(source_mime), '') = '' then
    raise exception 'Source bucket, path and mime type are required' using errcode = '23502';
  end if;

  if private.storage_org_id(source_path) is distinct from target_org_id then
    raise exception 'Source path must live under the organization prefix' using errcode = '42501';
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

  if jsonb_typeof(days) <> 'array' then
    raise exception 'Days must be an array' using errcode = '22023';
  end if;

  select count(*) into day_count from jsonb_array_elements(days);

  if day_count = 0 or day_count > 7 then
    raise exception 'Days must contain 1 to 7 entries' using errcode = '22023';
  end if;

  -- Validace všech dnů před prvním zápisem.
  for day_item in select value from jsonb_array_elements(days)
  loop
    if jsonb_typeof(day_item) <> 'object'
      or coalesce(day_item->>'menuDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Each day must contain menuDate (YYYY-MM-DD)' using errcode = '22023';
    end if;

    day_date := (day_item->>'menuDate')::date;

    if day_date < week_start or day_date > week_start + 6 then
      raise exception 'Menu date % is outside the imported week', day_date using errcode = '22023';
    end if;

    extraction_snapshot := day_item->'extractionSnapshot';

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
  end loop;

  if (
    select count(distinct value->>'menuDate') from jsonb_array_elements(days)
  ) <> day_count then
    raise exception 'Days contain duplicate menu dates' using errcode = '22023';
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
    source_bucket,
    source_path,
    source_mime,
    nullif(regexp_replace(source_path, '^.*/', ''), ''),
    'extracted',
    null
  )
  returning * into source_row;

  for day_item in select value from jsonb_array_elements(days)
  loop
    day_date := (day_item->>'menuDate')::date;
    extraction_snapshot := day_item->'extractionSnapshot';

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
      day_date,
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
      'openai-vision-week',
      'week-v1',
      extraction_snapshot,
      actor_id
    )
    returning * into version_row;

    section_index := 0;

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
      and m.id = menu_row.id;

    version_ids := version_ids || to_jsonb(version_row.id::text);

    menu_date := day_date;
    menu_id := menu_row.id;
    menu_version_id := version_row.id;
    return next;
  end loop;

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
    'import_week_from_source',
    'menu_source',
    source_row.id,
    jsonb_build_object(
      'source_id', source_row.id,
      'week_start', week_start,
      'day_count', day_count,
      'menu_version_ids', version_ids,
      'location_id', target_location_id,
      'canteen_id', target_canteen_id
    )
  );

  return;
end;
$$;

revoke all on function public.import_week_from_source(uuid, uuid, uuid, date, text, text, text, jsonb) from public;
grant execute on function public.import_week_from_source(uuid, uuid, uuid, date, text, text, text, jsonb) to authenticated;

-- Zařadí do fronty AI fotky pro jídla dané verze menu, která nemají fotku
-- v snapshotu ani výchozí fotku v knihovně (JEN exact match na normalizovaný
-- název — similarity by riskovala záměnu alergenů). Respektuje denní limit
-- automation.aiPhotos.dailyLimit. Vrací počet nově zařazených jobů.
create or replace function public.enqueue_missing_dish_photos(
  target_org_id uuid,
  target_menu_version_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  version_row public.menu_versions%rowtype;
  menu_row public.menus%rowtype;
  daily_limit integer;
  used_today integer;
  inserted_count integer := 0;
  candidate record;
  job_id uuid;
begin
  -- auth.uid() je null jen pro service role (grant nemá anon); ta kontrolu
  -- členství nepotřebuje — noční sweep běží bez uživatele.
  if actor_id is not null and not private.is_org_member(
    target_org_id,
    array['owner', 'admin', 'editor', 'designer', 'publisher']::public.org_role[]
  ) then
    raise exception 'Staff role required' using errcode = '42501';
  end if;

  select *
  into version_row
  from public.menu_versions
  where org_id = target_org_id
    and id = target_menu_version_id;

  if not found then
    raise exception 'Menu version not found' using errcode = 'P0002';
  end if;

  select *
  into menu_row
  from public.menus
  where org_id = target_org_id
    and id = version_row.menu_id;

  if not found then
    raise exception 'Menu not found' using errcode = 'P0002';
  end if;

  -- Vypínač automatiky: enabled=false znamená žádné nové joby.
  if exists (
    select 1
    from public.organizations
    where id = target_org_id
      and jsonb_typeof(settings->'automation'->'aiPhotos'->'enabled') = 'boolean'
      and not (settings->'automation'->'aiPhotos'->>'enabled')::boolean
  ) then
    return 0;
  end if;

  daily_limit := coalesce(
    (
      select case
        when jsonb_typeof(settings->'automation'->'aiPhotos'->'dailyLimit') = 'number'
          then (settings->'automation'->'aiPhotos'->>'dailyLimit')::integer
        else null
      end
      from public.organizations
      where id = target_org_id
    ),
    20
  );

  select count(*)
  into used_today
  from public.dish_photo_jobs
  where org_id = target_org_id
    and created_at::date = current_date;

  for candidate in
    select distinct on (private.normalize_dish_name(me.display_name))
      me.display_name,
      me.description
    from public.menu_entries me
    where me.org_id = target_org_id
      and me.menu_version_id = target_menu_version_id
      and me.available
      and length(private.normalize_dish_name(me.display_name)) > 0
      -- entry už má fotku přiřazenou ve snapshotu
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(version_row.snapshot->'sections', '[]'::jsonb)) as sections(section_value)
        cross join lateral jsonb_array_elements(coalesce(sections.section_value->'items', '[]'::jsonb)) as items(item_value)
        where items.item_value->>'id' = me.item_id
          and coalesce(items.item_value->>'photoAssetId', '') <> ''
      )
      -- v knihovně existuje výchozí fotka s exact normalized match
      and not exists (
        select 1
        from public.dish_photos dp
        where dp.org_id = target_org_id
          and dp.dish_name_normalized = private.normalize_dish_name(me.display_name)
          and dp.is_default
      )
      -- aktivní job už běží
      and not exists (
        select 1
        from public.dish_photo_jobs job
        where job.org_id = target_org_id
          and job.dish_name_normalized = private.normalize_dish_name(me.display_name)
          and job.status in ('queued', 'processing')
      )
    order by private.normalize_dish_name(me.display_name), me.sort_order
  loop
    exit when used_today + inserted_count >= daily_limit;

    job_id := null;

    insert into public.dish_photo_jobs (org_id, canteen_id, dish_name, description)
    values (target_org_id, menu_row.canteen_id, candidate.display_name, candidate.description)
    on conflict (org_id, dish_name_normalized) where status in ('queued', 'processing') do nothing
    returning id into job_id;

    if job_id is not null then
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.enqueue_missing_dish_photos(uuid, uuid) from public;
grant execute on function public.enqueue_missing_dish_photos(uuid, uuid) to authenticated;
grant execute on function public.enqueue_missing_dish_photos(uuid, uuid) to service_role;

-- Registrace AI fotky (jen service role, volá worker). Na rozdíl od
-- register_dish_photo se AI fotka stane výchozí JEN pokud neexistuje výchozí
-- lidská fotka — AI nikdy nedemotuje lidskou.
create or replace function public.register_ai_dish_photo(
  target_org_id uuid,
  target_asset_id uuid,
  target_dish_name text,
  target_canteen_id uuid default null
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
  normalized text := private.normalize_dish_name(target_dish_name);
  make_default boolean;
  photo_row public.dish_photos%rowtype;
begin
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

  -- Serializace souběžných registrací téhož jídla — jinak by dva workery
  -- mohly vytvořit dvě výchozí fotky najednou.
  perform pg_advisory_xact_lock(hashtext(target_org_id::text || ':' || normalized));

  make_default := not exists (
    select 1
    from public.dish_photos
    where org_id = target_org_id
      and dish_name_normalized = normalized
      and is_default
      and source <> 'ai'
  );

  -- make_default = true znamená, že případné stávající výchozí fotky jsou
  -- také AI — jen ty se tu demotují.
  if make_default then
    update public.dish_photos
    set is_default = false
    where org_id = target_org_id
      and dish_name_normalized = normalized
      and asset_id <> target_asset_id;
  end if;

  insert into public.dish_photos (org_id, canteen_id, asset_id, dish_name, is_default, source, created_by)
  values (target_org_id, target_canteen_id, target_asset_id, target_dish_name, make_default, 'ai', null)
  on conflict (org_id, dish_name_normalized, asset_id)
  do update set
    is_default = dish_photos.is_default or excluded.is_default,
    last_used_at = now()
  returning * into photo_row;

  return query select photo_row.id, photo_row.dish_name_normalized;
end;
$$;

revoke all on function public.register_ai_dish_photo(uuid, uuid, text, uuid) from public, authenticated;
grant execute on function public.register_ai_dish_photo(uuid, uuid, text, uuid) to service_role;

-- Pull-publish z 0015 rozšířený o guard automation.autoPublish a zápis každé
-- návratové větve do automation_runs (dedupe: 1 záznam na screen a den).
create or replace function public.auto_publish_due_deck(target_screen_id uuid)
returns table (
  screen_id uuid,
  deck_version_id uuid,
  publish_event_id uuid,
  published boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  screen_before public.screens%rowtype;
  screen_after public.screens%rowtype;
  location_row public.locations%rowtype;
  due_version public.deck_versions%rowtype;
  deck public.slide_decks%rowtype;
  today_local date;
  event_id uuid;
  publish_time timestamptz := now();
begin
  select *
  into screen_before
  from public.screens
  where id = target_screen_id
  for update;

  if not found then
    return;
  end if;

  select *
  into location_row
  from public.locations
  where org_id = screen_before.org_id
    and id = screen_before.location_id;

  today_local := (publish_time at time zone coalesce(location_row.timezone, 'Europe/Prague'))::date;

  if not coalesce(
    (
      select case
        when jsonb_typeof(settings->'automation'->'autoPublish') = 'boolean'
          then (settings->'automation'->>'autoPublish')::boolean
        else null
      end
      from public.organizations
      where id = screen_before.org_id
    ),
    true
  ) then
    insert into public.automation_runs (org_id, canteen_id, run_type, entity_type, entity_id, status, detail, dedupe_key, finished_at)
    values (
      screen_before.org_id,
      screen_before.canteen_id,
      'pull_publish',
      'screen',
      screen_before.id,
      'skipped',
      jsonb_build_object('reason', 'auto_publish_disabled', 'menu_date', today_local),
      'pull:' || target_screen_id::text || ':' || today_local::text,
      publish_time
    )
    on conflict (org_id, dedupe_key) do nothing;

    return query select screen_before.id, screen_before.current_deck_version_id, null::uuid, false;
    return;
  end if;

  select dv.*
  into due_version
  from public.deck_versions dv
  join public.menu_versions mv on mv.org_id = dv.org_id and mv.id = dv.menu_version_id
  join public.menus m on m.org_id = mv.org_id and m.id = mv.menu_id
  where dv.org_id = screen_before.org_id
    and m.canteen_id = screen_before.canteen_id
    and m.menu_date = today_local
    and dv.status = 'approved'
  order by dv.created_at desc
  limit 1;

  if not found then
    insert into public.automation_runs (org_id, canteen_id, run_type, entity_type, entity_id, status, detail, dedupe_key, finished_at)
    values (
      screen_before.org_id,
      screen_before.canteen_id,
      'pull_publish',
      'screen',
      screen_before.id,
      'skipped',
      jsonb_build_object('reason', 'no_deck_for_today', 'menu_date', today_local),
      'pull:' || target_screen_id::text || ':' || today_local::text,
      publish_time
    )
    on conflict (org_id, dedupe_key) do nothing;

    return query select screen_before.id, screen_before.current_deck_version_id, null::uuid, false;
    return;
  end if;

  -- Nikdy nepřepsat novější ruční publikaci starším připraveným deckem.
  if exists (
    select 1
    from public.publish_events pe
    where pe.org_id = screen_before.org_id
      and pe.screen_id = screen_before.id
      and pe.created_at >= due_version.created_at
  ) then
    insert into public.automation_runs (org_id, canteen_id, run_type, entity_type, entity_id, status, detail, dedupe_key, finished_at)
    values (
      screen_before.org_id,
      screen_before.canteen_id,
      'pull_publish',
      'screen',
      screen_before.id,
      'skipped',
      jsonb_build_object('reason', 'manual_publish_newer', 'menu_date', today_local),
      'pull:' || target_screen_id::text || ':' || today_local::text,
      publish_time
    )
    on conflict (org_id, dedupe_key) do nothing;

    return query select screen_before.id, screen_before.current_deck_version_id, null::uuid, false;
    return;
  end if;

  select *
  into deck
  from public.slide_decks
  where org_id = due_version.org_id
    and id = due_version.deck_id;

  if not found
    or deck.location_id <> screen_before.location_id
    or deck.canteen_id <> screen_before.canteen_id then
    insert into public.automation_runs (org_id, canteen_id, run_type, entity_type, entity_id, status, detail, dedupe_key, finished_at)
    values (
      screen_before.org_id,
      screen_before.canteen_id,
      'pull_publish',
      'screen',
      screen_before.id,
      'skipped',
      jsonb_build_object('reason', 'deck_screen_mismatch', 'menu_date', today_local),
      'pull:' || target_screen_id::text || ':' || today_local::text,
      publish_time
    )
    on conflict (org_id, dedupe_key) do nothing;

    return query select screen_before.id, screen_before.current_deck_version_id, null::uuid, false;
    return;
  end if;

  update public.deck_versions
  set status = 'published'
  where org_id = due_version.org_id
    and id = due_version.id
    and status = 'approved';

  update public.screens
  set current_deck_version_id = due_version.id,
      status = 'published',
      last_error = null
  where org_id = screen_before.org_id
    and id = screen_before.id
  returning * into screen_after;

  update public.slide_decks
  set published_deck_version_id = due_version.id
  where org_id = deck.org_id
    and id = deck.id;

  insert into public.publish_events (
    org_id,
    screen_id,
    deck_version_id,
    export_id,
    published_by,
    created_at
  )
  values (
    screen_before.org_id,
    screen_before.id,
    due_version.id,
    null,
    null,
    publish_time
  )
  returning id into event_id;

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
    screen_before.org_id,
    null,
    'auto_publish_due_deck',
    'screen',
    screen_before.id,
    to_jsonb(screen_before),
    jsonb_build_object(
      'screen', to_jsonb(screen_after),
      'deck_version_id', due_version.id,
      'publish_event_id', event_id,
      'menu_date', today_local,
      'mode', 'live_pull'
    )
  );

  insert into public.automation_runs (org_id, canteen_id, run_type, entity_type, entity_id, status, detail, dedupe_key, finished_at)
  values (
    screen_before.org_id,
    screen_before.canteen_id,
    'pull_publish',
    'screen',
    screen_before.id,
    'succeeded',
    jsonb_build_object(
      'deck_version_id', due_version.id,
      'publish_event_id', event_id,
      'menu_date', today_local
    ),
    'pull:' || target_screen_id::text || ':' || today_local::text,
    publish_time
  )
  on conflict (org_id, dedupe_key) do nothing;

  return query select screen_after.id, due_version.id, event_id, true;
end;
$$;

revoke all on function public.auto_publish_due_deck(uuid) from public;
grant execute on function public.auto_publish_due_deck(uuid) to service_role;

-- Storage hardening: limit velikosti a povolené mime typy dle účelu bucketu.
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]
where id = 'source-uploads';

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'dish-photos';
