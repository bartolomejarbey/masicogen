-- Plánování na dny dopředu: TV si v den D sama líně publikuje připravený
-- (approved) deck pro dnešní datum podle časové zóny provozovny.
-- Volá se service rolí z manifest endpointu — je samoopravné po výpadku
-- a nepotřebuje cron.

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

  return query select screen_after.id, due_version.id, event_id, true;
end;
$$;

revoke all on function public.auto_publish_due_deck(uuid) from public;
grant execute on function public.auto_publish_due_deck(uuid) to service_role;

-- Rychlé dohledání připravených decků pro kalendář a pull-publish.
create index if not exists deck_versions_org_status_created
  on public.deck_versions (org_id, status, created_at desc);
