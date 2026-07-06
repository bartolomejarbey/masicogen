alter table public.audit_log
  alter column org_id set not null;

drop policy if exists "members read audit log" on public.audit_log;
create policy "members read audit log"
on public.audit_log for select
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin']::public.org_role[]));

drop policy if exists "members read canteens" on public.canteens;
create policy "members read canteens"
on public.canteens for select
to authenticated
using (private.can_access_location(org_id, location_id));

drop policy if exists "members read screens" on public.screens;
create policy "members read screens"
on public.screens for select
to authenticated
using (private.can_access_location(org_id, location_id));

drop policy if exists "editors manage menu sources" on public.menu_sources;
create policy "editors manage menu sources"
on public.menu_sources for all
to authenticated
using (
  private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[])
  and private.can_access_location(org_id, location_id)
)
with check (
  private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[])
  and private.can_access_location(org_id, location_id)
);

drop policy if exists "members read menus" on public.menus;
create policy "members read menus"
on public.menus for select
to authenticated
using (private.can_access_location(org_id, location_id));

drop policy if exists "editors manage menus" on public.menus;
create policy "editors manage menus"
on public.menus for all
to authenticated
using (
  private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[])
  and private.can_access_location(org_id, location_id)
)
with check (
  private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[])
  and private.can_access_location(org_id, location_id)
);

drop policy if exists "members read menu versions" on public.menu_versions;
create policy "members read menu versions"
on public.menu_versions for select
to authenticated
using (
  exists (
    select 1
    from public.menus menu
    where menu.org_id = menu_versions.org_id
      and menu.id = menu_versions.menu_id
      and private.can_access_location(menu.org_id, menu.location_id)
  )
);

drop policy if exists "editors insert menu versions" on public.menu_versions;
create policy "editors insert menu versions"
on public.menu_versions for insert
to authenticated
with check (
  private.is_org_member(org_id, array['owner', 'admin', 'editor']::public.org_role[])
  and exists (
    select 1
    from public.menus menu
    where menu.org_id = menu_versions.org_id
      and menu.id = menu_versions.menu_id
      and private.can_access_location(menu.org_id, menu.location_id)
  )
);

drop policy if exists "members read version children" on public.menu_entries;
create policy "members read version children"
on public.menu_entries for select
to authenticated
using (
  exists (
    select 1
    from public.menu_versions version
    join public.menus menu
      on menu.org_id = version.org_id
     and menu.id = version.menu_id
    where version.org_id = menu_entries.org_id
      and version.id = menu_entries.menu_version_id
      and private.can_access_location(menu.org_id, menu.location_id)
  )
);

drop policy if exists "members read deck data" on public.slide_decks;
create policy "members read deck data"
on public.slide_decks for select
to authenticated
using (private.can_access_location(org_id, location_id));

drop policy if exists "editors manage deck data" on public.slide_decks;
create policy "editors manage deck data"
on public.slide_decks for all
to authenticated
using (
  private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[])
  and private.can_access_location(org_id, location_id)
)
with check (
  private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[])
  and private.can_access_location(org_id, location_id)
);

drop policy if exists "members read deck versions" on public.deck_versions;
create policy "members read deck versions"
on public.deck_versions for select
to authenticated
using (
  exists (
    select 1
    from public.slide_decks deck
    where deck.org_id = deck_versions.org_id
      and deck.id = deck_versions.deck_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
);

drop policy if exists "editors insert deck versions" on public.deck_versions;
create policy "editors insert deck versions"
on public.deck_versions for insert
to authenticated
with check (
  private.is_org_member(org_id, array['owner', 'admin', 'editor', 'designer']::public.org_role[])
  and exists (
    select 1
    from public.slide_decks deck
    where deck.org_id = deck_versions.org_id
      and deck.id = deck_versions.deck_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
);

drop policy if exists "members read slides" on public.slides;
create policy "members read slides"
on public.slides for select
to authenticated
using (
  exists (
    select 1
    from public.deck_versions version
    join public.slide_decks deck
      on deck.org_id = version.org_id
     and deck.id = version.deck_id
    where version.org_id = slides.org_id
      and version.id = slides.deck_version_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
);

drop policy if exists "members read operational logs" on public.render_jobs;
create policy "members read operational logs"
on public.render_jobs for select
to authenticated
using (
  exists (
    select 1
    from public.deck_versions version
    join public.slide_decks deck
      on deck.org_id = version.org_id
     and deck.id = version.deck_id
    where version.org_id = render_jobs.org_id
      and version.id = render_jobs.deck_version_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
);

drop policy if exists "members read job events" on public.job_events;
create policy "members read job events"
on public.job_events for select
to authenticated
using (
  exists (
    select 1
    from public.render_jobs job
    join public.deck_versions version
      on version.org_id = job.org_id
     and version.id = job.deck_version_id
    join public.slide_decks deck
      on deck.org_id = version.org_id
     and deck.id = version.deck_id
    where job.org_id = job_events.org_id
      and job.id = job_events.render_job_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
);

drop policy if exists "publishers manage render jobs" on public.render_jobs;
create policy "publishers manage render jobs"
on public.render_jobs for all
to authenticated
using (
  private.is_org_member(org_id, array['owner', 'admin', 'publisher']::public.org_role[])
  and exists (
    select 1
    from public.deck_versions version
    join public.slide_decks deck
      on deck.org_id = version.org_id
     and deck.id = version.deck_id
    where version.org_id = render_jobs.org_id
      and version.id = render_jobs.deck_version_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
)
with check (
  private.is_org_member(org_id, array['owner', 'admin', 'publisher']::public.org_role[])
  and exists (
    select 1
    from public.deck_versions version
    join public.slide_decks deck
      on deck.org_id = version.org_id
     and deck.id = version.deck_id
    where version.org_id = render_jobs.org_id
      and version.id = render_jobs.deck_version_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
);

drop policy if exists "members read exports" on public.exports;
create policy "members read exports"
on public.exports for select
to authenticated
using (
  exists (
    select 1
    from public.deck_versions version
    join public.slide_decks deck
      on deck.org_id = version.org_id
     and deck.id = version.deck_id
    where version.org_id = exports.org_id
      and version.id = exports.deck_version_id
      and private.can_access_location(deck.org_id, deck.location_id)
  )
);

drop policy if exists "members read publish events" on public.publish_events;
create policy "members read publish events"
on public.publish_events for select
to authenticated
using (
  exists (
    select 1
    from public.screens screen
    where screen.org_id = publish_events.org_id
      and screen.id = publish_events.screen_id
      and private.can_access_location(screen.org_id, screen.location_id)
  )
);
