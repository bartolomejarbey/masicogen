-- Ruční prezentace nesmí přepisovat denní menu jídelny. Vlastní import
-- vytvoří menu_versions řádek označený extraction_model 'manual-presentation',
-- ale na rozdíl od import_text_menu_version NEresetuje menus.status,
-- NEpřepisuje menus.current_version_id a nevytváří menu_entries ani
-- menu_sources. Denní tok (/den, /tyden, autopilot morning-check, retention)
-- verze 'manual-presentation' filtruje.

create or replace function public.import_manual_presentation_menu_version(
  target_org_id uuid,
  target_location_id uuid,
  target_canteen_id uuid,
  target_menu_date date,
  extraction_snapshot jsonb
)
returns table (
  org_id uuid,
  menu_id uuid,
  menu_version_id uuid,
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
  version_row public.menu_versions%rowtype;
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
    from jsonb_array_elements(extraction_snapshot->'sections') as sections(section_value)
    cross join lateral jsonb_array_elements(coalesce(sections.section_value->'items', '[]'::jsonb)) as items(item_value)
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

  -- Menu dne se pouze doplní, pokud chybí; existující řádek zůstává
  -- nedotčený (status i current_version_id patří dennímu toku).
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
  do nothing
  returning * into menu_row;

  if menu_row.id is null then
    select m.*
    into menu_row
    from public.menus as m
    where m.org_id = canteen_row.org_id
      and m.canteen_id = target_canteen_id
      and m.menu_date = target_menu_date;

    if not found then
      raise exception 'Menu not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.menu_versions (
    org_id,
    menu_id,
    status,
    extraction_model,
    extraction_prompt_version,
    snapshot,
    created_by
  )
  values (
    canteen_row.org_id,
    menu_row.id,
    'draft',
    'manual-presentation',
    'manual-editor-1',
    extraction_snapshot,
    actor_id
  )
  returning * into version_row;

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
    'import_manual_presentation_menu',
    'menu_version',
    version_row.id,
    jsonb_build_object(
      'menu_id', menu_row.id,
      'menu_version_id', version_row.id,
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
      menu_row.menu_date,
      version_row.status;
end;
$$;

revoke all on function public.import_manual_presentation_menu_version(uuid, uuid, uuid, date, jsonb) from public;
grant execute on function public.import_manual_presentation_menu_version(uuid, uuid, uuid, date, jsonb) to authenticated;
