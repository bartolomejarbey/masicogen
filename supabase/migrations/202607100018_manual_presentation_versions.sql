-- Ruční prezentace: bezpečné, auditované a immutable verze nad stávajícím
-- slide_decks/deck_versions modelem. Náhled, PDF, live player i MP4 používají
-- stejný DeckManifest a stejné TemplateManifestV2.

create or replace function public.save_manual_presentation_version(
  target_deck_id uuid,
  expected_deck_version_id uuid,
  target_menu_version_id uuid,
  presentation_name text,
  deck_manifest jsonb
)
returns table (
  org_id uuid,
  deck_id uuid,
  deck_version_id uuid,
  menu_version_id uuid,
  status public.approval_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  menu_version_row public.menu_versions%rowtype;
  menu_row public.menus%rowtype;
  deck_row public.slide_decks%rowtype;
  deck_version_row public.deck_versions%rowtype;
  latest_deck_version public.deck_versions%rowtype;
  slide_item jsonb;
  slide_count integer;
  duration_frames integer;
  template_slug text;
  template_manifest jsonb;
  template_row_id uuid;
  latest_template_version integer;
  latest_template_manifest jsonb;
  template_version_id uuid;
  version_map jsonb := '{}'::jsonb;
  version_ids jsonb := '[]'::jsonb;
  asset_id_text text;
  final_manifest jsonb;
  sort_index integer := 0;
  audit_action text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into menu_version_row
  from public.menu_versions
  where id = target_menu_version_id;

  if not found then
    raise exception 'Menu version not found' using errcode = 'P0002';
  end if;

  if not private.is_org_member(
    menu_version_row.org_id,
    array['owner', 'admin', 'editor']::public.org_role[]
  ) then
    raise exception 'Editor role required' using errcode = '42501';
  end if;

  select *
  into menu_row
  from public.menus
  where org_id = menu_version_row.org_id
    and id = menu_version_row.menu_id;

  if not found then
    raise exception 'Menu not found' using errcode = 'P0002';
  end if;

  if not private.can_access_location(menu_version_row.org_id, menu_row.location_id) then
    raise exception 'Location access required' using errcode = '42501';
  end if;

  if presentation_name is null
    or length(trim(presentation_name)) = 0
    or length(trim(presentation_name)) > 140 then
    raise exception 'Presentation name is invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(deck_manifest) <> 'object'
    or deck_manifest->>'editorSource' is distinct from 'masicogen-manual-presentation'
    or jsonb_typeof(deck_manifest->'editorDocument') <> 'object'
    or jsonb_typeof(deck_manifest->'slides') <> 'array'
    or jsonb_typeof(deck_manifest->'templateManifests') <> 'object' then
    raise exception 'Manual presentation manifest is invalid' using errcode = '22023';
  end if;

  if deck_manifest#>>'{editorDocument,locationId}' is distinct from menu_row.location_id::text
    or deck_manifest#>>'{editorDocument,canteenId}' is distinct from menu_row.canteen_id::text
    or deck_manifest#>>'{editorDocument,presentationDate}' is distinct from menu_row.menu_date::text
    or trim(deck_manifest#>>'{editorDocument,name}') is distinct from trim(presentation_name) then
    raise exception 'Presentation document context does not match its menu'
      using errcode = '22023';
  end if;

  select count(*) into slide_count from jsonb_array_elements(deck_manifest->'slides');
  if slide_count = 0 or slide_count > 12 then
    raise exception 'Presentation has unsupported slide count' using errcode = '22023';
  end if;

  if (deck_manifest#>>'{canvas,width}')::integer is distinct from 1920
    or (deck_manifest#>>'{canvas,height}')::integer is distinct from 1080 then
    raise exception 'Presentation has unsupported canvas' using errcode = '22023';
  end if;

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

    if template_slug !~ '^manual-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or deck_manifest->'templateManifests'->template_slug->>'id' is distinct from template_slug then
      raise exception 'Manual slide template id is invalid' using errcode = '22023';
    end if;
  end loop;

  for asset_id_text in
    select jsonb_array_elements_text(coalesce(deck_manifest->'assetIds', '[]'::jsonb))
  loop
    if not exists (
      select 1
      from public.assets
      where org_id = menu_version_row.org_id
        and id = asset_id_text::uuid
        and type = 'image'
    ) then
      raise exception 'Presentation references unknown asset %', asset_id_text
        using errcode = 'P0002';
    end if;
  end loop;

  if target_deck_id is null then
    if expected_deck_version_id is not null then
      raise exception 'New presentation cannot have an expected version' using errcode = '22023';
    end if;

    insert into public.slide_decks (org_id, location_id, canteen_id, name)
    values (
      menu_version_row.org_id,
      menu_row.location_id,
      menu_row.canteen_id,
      trim(presentation_name)
    )
    returning * into deck_row;

    audit_action := 'create_manual_presentation';
  else
    select *
    into deck_row
    from public.slide_decks
    where org_id = menu_version_row.org_id
      and id = target_deck_id
    for update;

    if not found then
      raise exception 'Presentation not found' using errcode = 'P0002';
    end if;

    if deck_row.location_id <> menu_row.location_id
      or deck_row.canteen_id <> menu_row.canteen_id then
      raise exception 'Presentation location cannot change' using errcode = '23514';
    end if;

    select *
    into latest_deck_version
    from public.deck_versions
    where org_id = deck_row.org_id
      and deck_id = deck_row.id
    order by created_at desc, id desc
    limit 1;

    if not found
      or latest_deck_version.manifest_json->>'editorSource'
        is distinct from 'masicogen-manual-presentation' then
      raise exception 'Presentation not found' using errcode = 'P0002';
    end if;

    if latest_deck_version.manifest_json->>'editorArchived' = 'true' then
      raise exception 'Presentation is archived' using errcode = '23514';
    end if;

    if expected_deck_version_id is null
      or latest_deck_version.id <> expected_deck_version_id then
      raise exception 'Manual presentation version conflict' using errcode = '55000';
    end if;

    update public.slide_decks
    set name = trim(presentation_name)
    where org_id = deck_row.org_id and id = deck_row.id
    returning * into deck_row;

    audit_action := 'update_manual_presentation';
  end if;

  -- Každý ruční slide má vlastní slug šablony. Stejný manifest znovu použije
  -- poslední verzi; změna rozložení vytvoří novou immutable template_version.
  for template_slug in
    select distinct value->>'templateId' from jsonb_array_elements(deck_manifest->'slides')
  loop
    template_manifest := deck_manifest->'templateManifests'->template_slug;

    insert into public.templates (org_id, slug, name, kind)
    values (
      menu_version_row.org_id,
      template_slug,
      coalesce(template_manifest->>'name', template_slug),
      coalesce(template_manifest->>'templateKind', 'daily_menu')
    )
    on conflict (org_id, slug) do update set name = excluded.name
    returning id into template_row_id;

    if template_row_id is null then
      select id into template_row_id
      from public.templates
      where org_id = menu_version_row.org_id and slug = template_slug;
    end if;

    select tv.version, tv.manifest_json
    into latest_template_version, latest_template_manifest
    from public.template_versions tv
    where tv.org_id = menu_version_row.org_id
      and tv.template_id = template_row_id
    order by tv.version desc
    limit 1;

    if latest_template_manifest is not null and latest_template_manifest = template_manifest then
      select tv.id into template_version_id
      from public.template_versions tv
      where tv.org_id = menu_version_row.org_id
        and tv.template_id = template_row_id
        and tv.version = latest_template_version;
    else
      insert into public.template_versions (org_id, template_id, version, manifest_json, created_by)
      values (
        menu_version_row.org_id,
        template_row_id,
        coalesce(latest_template_version, 0) + 1,
        template_manifest,
        actor_id
      )
      returning id into template_version_id;
    end if;

    update public.templates
    set current_version_id = template_version_id
    where org_id = menu_version_row.org_id and id = template_row_id;

    version_map := version_map || jsonb_build_object(template_slug, template_version_id::text);
    version_ids := version_ids || to_jsonb(template_version_id::text);
  end loop;

  final_manifest := deck_manifest
    || jsonb_build_object(
      'id', deck_row.id,
      'orgId', menu_version_row.org_id,
      'locationId', menu_row.location_id,
      'canteenId', menu_row.canteen_id,
      'menuVersionId', menu_version_row.id,
      'status', 'draft',
      'templateVersionIds', version_ids,
      'editorArchived', false
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
    menu_version_row.org_id,
    deck_row.id,
    menu_version_row.id,
    'draft',
    final_manifest,
    actor_id
  )
  returning * into deck_version_row;

  for slide_item in select value from jsonb_array_elements(deck_manifest->'slides')
  loop
    sort_index := sort_index + 1;

    insert into public.slides (
      org_id,
      deck_version_id,
      template_version_id,
      title,
      manifest_json,
      sort_order
    )
    values (
      menu_version_row.org_id,
      deck_version_row.id,
      (version_map->>(slide_item->>'templateId'))::uuid,
      coalesce(slide_item->>'title', 'Slide ' || sort_index::text),
      slide_item,
      sort_index
    );
  end loop;

  update public.dish_photos
  set use_count = use_count + 1,
      last_used_at = now()
  where org_id = menu_version_row.org_id
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
    menu_version_row.org_id,
    actor_id,
    audit_action,
    'deck_version',
    deck_version_row.id,
    jsonb_build_object(
      'deck_id', deck_row.id,
      'deck_version_id', deck_version_row.id,
      'menu_version_id', menu_version_row.id,
      'expected_deck_version_id', expected_deck_version_id,
      'slide_count', slide_count,
      'template_versions', version_map
    )
  );

  return query
  select
    menu_version_row.org_id,
    deck_row.id,
    deck_version_row.id,
    menu_version_row.id,
    deck_version_row.status,
    deck_version_row.created_at;
end;
$$;

revoke all on function public.save_manual_presentation_version(uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.save_manual_presentation_version(uuid, uuid, uuid, text, jsonb) to authenticated;

create or replace function public.archive_manual_presentation(
  target_deck_id uuid,
  expected_deck_version_id uuid
)
returns table (
  deck_id uuid,
  deck_version_id uuid,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  deck_row public.slide_decks%rowtype;
  latest_version public.deck_versions%rowtype;
  archived_version public.deck_versions%rowtype;
  archived_manifest jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into deck_row
  from public.slide_decks
  where id = target_deck_id
  for update;

  if not found then
    raise exception 'Presentation not found' using errcode = 'P0002';
  end if;

  if not private.is_org_member(
    deck_row.org_id,
    array['owner', 'admin', 'editor']::public.org_role[]
  ) or not private.can_access_location(deck_row.org_id, deck_row.location_id) then
    raise exception 'Editor role required' using errcode = '42501';
  end if;

  select *
  into latest_version
  from public.deck_versions
  where org_id = deck_row.org_id and deck_id = deck_row.id
  order by created_at desc, id desc
  limit 1;

  if not found
    or latest_version.manifest_json->>'editorSource'
      is distinct from 'masicogen-manual-presentation' then
    raise exception 'Presentation not found' using errcode = 'P0002';
  end if;

  if expected_deck_version_id is null or latest_version.id <> expected_deck_version_id then
    raise exception 'Manual presentation version conflict' using errcode = '55000';
  end if;

  if latest_version.manifest_json->>'editorArchived' = 'true' then
    return query select deck_row.id, latest_version.id, latest_version.created_at;
    return;
  end if;

  archived_manifest := latest_version.manifest_json
    || jsonb_build_object(
      'status', 'draft',
      'slides', '[]'::jsonb,
      'editorArchived', true
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
    latest_version.org_id,
    latest_version.deck_id,
    latest_version.menu_version_id,
    'draft',
    archived_manifest,
    actor_id
  )
  returning * into archived_version;

  insert into public.audit_log (
    org_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_json
  )
  values (
    deck_row.org_id,
    actor_id,
    'archive_manual_presentation',
    'deck_version',
    archived_version.id,
    jsonb_build_object(
      'deck_id', deck_row.id,
      'previous_deck_version_id', latest_version.id,
      'archived_deck_version_id', archived_version.id
    )
  );

  return query select deck_row.id, archived_version.id, archived_version.created_at;
end;
$$;

revoke all on function public.archive_manual_presentation(uuid, uuid) from public;
grant execute on function public.archive_manual_presentation(uuid, uuid) to authenticated;
