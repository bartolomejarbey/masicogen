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

  if not private.is_org_member(canteen_row.org_id, array['owner', 'admin', 'editor']::public.org_role[])
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
