create or replace function public.create_tv_deck_from_menu_version(
  target_menu_version_id uuid,
  target_background_asset_id uuid default null
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
declare
  actor_id uuid := auth.uid();
  version_row public.menu_versions%rowtype;
  menu_row public.menus%rowtype;
  background_asset public.assets%rowtype;
  deck_row public.slide_decks%rowtype;
  deck_version_row public.deck_versions%rowtype;
  daily_template_id uuid;
  daily_template_version_id uuid;
  special_template_id uuid;
  special_template_version_id uuid;
  legend_template_id uuid;
  legend_template_version_id uuid;
  section_ids text[];
  item_ids text[];
  highlighted_item_id text;
  deck_manifest jsonb;
  daily_slide jsonb;
  special_slide jsonb;
  legend_slide jsonb;
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

  if not private.is_org_member(version_row.org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[]) then
    raise exception 'Editor or designer role required' using errcode = '42501';
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

  if target_background_asset_id is not null then
    select *
    into background_asset
    from public.assets
    where org_id = version_row.org_id
      and id = target_background_asset_id
      and type = 'image';

    if not found then
      raise exception 'Background asset not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.templates (org_id, slug, name, kind)
  values
    (version_row.org_id, 'daily-menu', 'Denní menu', 'daily_menu'),
    (version_row.org_id, 'special-offer', 'Special nabídka', 'special'),
    (version_row.org_id, 'allergen-legend', 'Alergenová legenda', 'allergen_legend')
  on conflict (org_id, slug) do update set name = excluded.name;

  select id into daily_template_id from public.templates where org_id = version_row.org_id and slug = 'daily-menu';
  select id into special_template_id from public.templates where org_id = version_row.org_id and slug = 'special-offer';
  select id into legend_template_id from public.templates where org_id = version_row.org_id and slug = 'allergen-legend';

  insert into public.template_versions (org_id, template_id, version, manifest_json, created_by)
  values (
    version_row.org_id,
    daily_template_id,
    1,
    jsonb_build_object(
      'id', 'daily-menu',
      'name', 'Denní menu',
      'templateKind', 'daily_menu',
      'canvas', jsonb_build_object('width', 1920, 'height', 1080, 'aspectRatio', '16:9'),
      'safeArea', jsonb_build_object('x', 128, 'y', 72, 'width', 1664, 'height', 936),
      'backgroundAssetId', target_background_asset_id,
      'durationFrames', 270,
      'transition', 'fade',
      'textLayers', '[]'::jsonb,
      'validationRules', jsonb_build_object('minContrastRatio', 4.5, 'maxItemsPerSlide', 5, 'requireAllergenLegend', true)
    ),
    actor_id
  )
  on conflict (org_id, template_id, version) do update set manifest_json = excluded.manifest_json
  returning id into daily_template_version_id;

  insert into public.template_versions (org_id, template_id, version, manifest_json, created_by)
  values (
    version_row.org_id,
    special_template_id,
    1,
    jsonb_build_object(
      'id', 'special-offer',
      'name', 'Special nabídka',
      'templateKind', 'special',
      'canvas', jsonb_build_object('width', 1920, 'height', 1080, 'aspectRatio', '16:9'),
      'safeArea', jsonb_build_object('x', 128, 'y', 72, 'width', 1664, 'height', 936),
      'backgroundAssetId', target_background_asset_id,
      'durationFrames', 240,
      'transition', 'fade',
      'textLayers', '[]'::jsonb,
      'validationRules', jsonb_build_object('minContrastRatio', 4.5, 'maxItemsPerSlide', 3, 'requireAllergenLegend', true)
    ),
    actor_id
  )
  on conflict (org_id, template_id, version) do update set manifest_json = excluded.manifest_json
  returning id into special_template_version_id;

  insert into public.template_versions (org_id, template_id, version, manifest_json, created_by)
  values (
    version_row.org_id,
    legend_template_id,
    1,
    jsonb_build_object(
      'id', 'allergen-legend',
      'name', 'Alergenová legenda',
      'templateKind', 'allergen_legend',
      'canvas', jsonb_build_object('width', 1920, 'height', 1080, 'aspectRatio', '16:9'),
      'safeArea', jsonb_build_object('x', 128, 'y', 72, 'width', 1664, 'height', 936),
      'backgroundAssetId', target_background_asset_id,
      'durationFrames', 300,
      'transition', 'fade',
      'textLayers', '[]'::jsonb,
      'validationRules', jsonb_build_object('minContrastRatio', 4.5, 'maxItemsPerSlide', 14, 'requireAllergenLegend', false)
    ),
    actor_id
  )
  on conflict (org_id, template_id, version) do update set manifest_json = excluded.manifest_json
  returning id into legend_template_version_id;

  update public.templates set current_version_id = daily_template_version_id where org_id = version_row.org_id and id = daily_template_id;
  update public.templates set current_version_id = special_template_version_id where org_id = version_row.org_id and id = special_template_id;
  update public.templates set current_version_id = legend_template_version_id where org_id = version_row.org_id and id = legend_template_id;

  select coalesce(array_agg(section_id order by first_sort), '{}')
  into section_ids
  from (
    select section_id, min(sort_order) as first_sort
    from public.menu_entries
    where org_id = version_row.org_id
      and menu_version_id = version_row.id
    group by section_id
  ) section_rows;

  select coalesce(array_agg(item_id order by sort_order), '{}')
  into item_ids
  from public.menu_entries
  where org_id = version_row.org_id
    and menu_version_id = version_row.id;

  select item_id
  into highlighted_item_id
  from public.menu_entries
  where org_id = version_row.org_id
    and menu_version_id = version_row.id
  order by highlight desc, sort_order asc
  limit 1;

  if coalesce(array_length(item_ids, 1), 0) = 0 then
    raise exception 'Menu version has no entries' using errcode = '23514';
  end if;

  insert into public.slide_decks (org_id, location_id, canteen_id, name)
  values (
    version_row.org_id,
    menu_row.location_id,
    menu_row.canteen_id,
    'TV smyčka ' || menu_row.menu_date::text
  )
  returning * into deck_row;

  daily_slide := jsonb_build_object(
    'id', 'slide-daily',
    'templateId', 'daily-menu',
    'title', 'Dnešní menu',
    'menuSectionIds', to_jsonb(section_ids),
    'menuItemIds', to_jsonb(item_ids),
    'backgroundAssetId', target_background_asset_id,
    'durationFrames', 270,
    'sortOrder', 1
  );

  special_slide := jsonb_build_object(
    'id', 'slide-special',
    'templateId', 'special-offer',
    'title', 'Special menu',
    'menuSectionIds', '[]'::jsonb,
    'menuItemIds', to_jsonb(array[highlighted_item_id]),
    'backgroundAssetId', target_background_asset_id,
    'durationFrames', 240,
    'sortOrder', 2
  );

  legend_slide := jsonb_build_object(
    'id', 'slide-allergens',
    'templateId', 'allergen-legend',
    'title', 'Alergenová legenda',
    'menuSectionIds', '[]'::jsonb,
    'menuItemIds', '[]'::jsonb,
    'backgroundAssetId', target_background_asset_id,
    'durationFrames', 300,
    'sortOrder', 3
  );

  deck_manifest := jsonb_build_object(
    'id', deck_row.id,
    'orgId', version_row.org_id,
    'locationId', menu_row.location_id,
    'canteenId', menu_row.canteen_id,
    'menuVersionId', version_row.id,
    'status', 'draft',
    'fps', 30,
    'canvas', jsonb_build_object('width', 1920, 'height', 1080, 'aspectRatio', '16:9'),
    'slides', jsonb_build_array(daily_slide, special_slide, legend_slide),
    'templateVersionIds', jsonb_build_array(daily_template_version_id, special_template_version_id, legend_template_version_id),
    'assetIds', case when target_background_asset_id is null then '[]'::jsonb else jsonb_build_array(target_background_asset_id) end,
    'assetUrls', '{}'::jsonb,
    'rendererVersion', '0.1.0'
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
    deck_manifest,
    actor_id
  )
  returning * into deck_version_row;

  insert into public.slides (org_id, deck_version_id, template_version_id, title, manifest_json, sort_order)
  values
    (version_row.org_id, deck_version_row.id, daily_template_version_id, 'Dnešní menu', daily_slide, 1),
    (version_row.org_id, deck_version_row.id, special_template_version_id, 'Special menu', special_slide, 2),
    (version_row.org_id, deck_version_row.id, legend_template_version_id, 'Alergenová legenda', legend_slide, 3);

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
    'create_tv_deck_from_menu_version',
    'deck_version',
    deck_version_row.id,
    jsonb_build_object(
      'deck_id', deck_row.id,
      'deck_version_id', deck_version_row.id,
      'menu_version_id', version_row.id,
      'background_asset_id', target_background_asset_id
    )
  );

  return query select version_row.org_id, deck_row.id, deck_version_row.id, version_row.id, deck_version_row.status;
end;
$$;

create or replace function public.publish_live_deck_to_screen(
  target_screen_id uuid,
  target_deck_version_id uuid,
  publish_comment text default null
)
returns table (
  screen_id uuid,
  deck_version_id uuid,
  publish_event_id uuid,
  screen_status text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  screen_before public.screens%rowtype;
  screen_after public.screens%rowtype;
  deck_version public.deck_versions%rowtype;
  deck public.slide_decks%rowtype;
  event_id uuid;
  publish_time timestamptz := now();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into screen_before
  from public.screens
  where id = target_screen_id
  for update;

  if not found then
    raise exception 'Screen not found' using errcode = 'P0002';
  end if;

  if not private.is_org_member(screen_before.org_id, array['owner', 'admin', 'publisher']::public.org_role[]) then
    raise exception 'Publisher role required' using errcode = '42501';
  end if;

  select *
  into deck_version
  from public.deck_versions
  where org_id = screen_before.org_id
    and id = target_deck_version_id
  for update;

  if not found then
    raise exception 'Deck version not found for screen organization' using errcode = 'P0002';
  end if;

  if deck_version.status not in ('approved', 'published') then
    raise exception 'Deck version must be approved before live publish' using errcode = '23514';
  end if;

  select *
  into deck
  from public.slide_decks
  where org_id = deck_version.org_id
    and id = deck_version.deck_id;

  if not found then
    raise exception 'Deck not found' using errcode = 'P0002';
  end if;

  if deck.location_id <> screen_before.location_id or deck.canteen_id <> screen_before.canteen_id then
    raise exception 'Deck and screen belong to different location or canteen' using errcode = '23514';
  end if;

  if deck_version.status = 'approved' then
    update public.deck_versions
    set status = 'published'
    where org_id = deck_version.org_id
      and id = deck_version.id;
  end if;

  update public.screens
  set current_deck_version_id = deck_version.id,
      status = 'published',
      last_error = null
  where org_id = screen_before.org_id
    and id = screen_before.id
  returning * into screen_after;

  update public.slide_decks
  set published_deck_version_id = deck_version.id
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
    deck_version.id,
    null,
    actor_id,
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
    actor_id,
    'publish_live_deck_to_screen',
    'screen',
    screen_before.id,
    to_jsonb(screen_before),
    jsonb_build_object(
      'screen', to_jsonb(screen_after),
      'deck_version_id', deck_version.id,
      'publish_event_id', event_id,
      'comment', publish_comment,
      'mode', 'live'
    )
  );

  return query select screen_after.id, deck_version.id, event_id, screen_after.status, publish_time;
end;
$$;

revoke all on function public.create_tv_deck_from_menu_version(uuid, uuid) from public;
revoke all on function public.publish_live_deck_to_screen(uuid, uuid, text) from public;

grant execute on function public.create_tv_deck_from_menu_version(uuid, uuid) to authenticated;
grant execute on function public.publish_live_deck_to_screen(uuid, uuid, text) to authenticated;
