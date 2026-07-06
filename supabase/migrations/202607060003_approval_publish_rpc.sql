alter table public.approval_requests
  add constraint approval_requests_org_id_unique unique (org_id, id);

alter table public.approval_steps
  drop constraint if exists approval_steps_approval_request_id_fkey;

alter table public.approval_steps
  add constraint approval_steps_request_org_fk
  foreign key (org_id, approval_request_id)
  references public.approval_requests(org_id, id)
  on delete cascade;

create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Audit log is append-only';
end;
$$;

drop trigger if exists immutable_audit_log on public.audit_log;
create trigger immutable_audit_log
before update or delete on public.audit_log
for each row execute function private.prevent_audit_log_mutation();

create or replace function private.prevent_final_approval_request_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.status in ('approved', 'rejected', 'published') then
    raise exception 'Final approval requests are immutable';
  end if;

  if tg_op = 'UPDATE' and old.status in ('approved', 'rejected', 'published') then
    raise exception 'Final approval requests are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists immutable_final_approval_requests on public.approval_requests;
create trigger immutable_final_approval_requests
before update or delete on public.approval_requests
for each row execute function private.prevent_final_approval_request_mutation();

create or replace function private.prevent_final_approval_step_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and (old.decision <> 'needs_review' or old.decided_at is not null) then
    raise exception 'Final approval steps are immutable';
  end if;

  if tg_op = 'UPDATE' and (old.decision <> 'needs_review' or old.decided_at is not null) then
    raise exception 'Final approval steps are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists immutable_final_approval_steps on public.approval_steps;
create trigger immutable_final_approval_steps
before update or delete on public.approval_steps
for each row execute function private.prevent_final_approval_step_mutation();

drop policy if exists "members read approval steps" on public.approval_steps;
create policy "members read approval steps"
on public.approval_steps for select
to authenticated
using (private.is_org_member(org_id, null));

drop policy if exists "approvers manage approval steps" on public.approval_steps;
create policy "approvers manage approval steps"
on public.approval_steps for all
to authenticated
using (private.is_org_member(org_id, array['owner', 'admin', 'approver']::public.org_role[]))
with check (private.is_org_member(org_id, array['owner', 'admin', 'approver']::public.org_role[]));

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

  if not private.is_org_member(version_before.org_id, array['owner', 'admin', 'approver']::public.org_role[]) then
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

  if not private.is_org_member(version_before.org_id, array['owner', 'admin', 'approver']::public.org_role[]) then
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

create or replace function public.publish_deck_to_screen(
  target_screen_id uuid,
  target_deck_version_id uuid,
  target_export_id uuid,
  publish_comment text default null
)
returns table (
  screen_id uuid,
  deck_version_id uuid,
  export_id uuid,
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
  export_row public.exports%rowtype;
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
    raise exception 'Deck version must be approved before publish' using errcode = '23514';
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

  select *
  into export_row
  from public.exports
  where org_id = screen_before.org_id
    and id = target_export_id
  for share;

  if not found then
    raise exception 'Export not found for screen organization' using errcode = 'P0002';
  end if;

  if export_row.deck_version_id <> deck_version.id then
    raise exception 'Export does not belong to deck version' using errcode = '23514';
  end if;

  if export_row.format <> 'mp4'
    or export_row.bucket is null
    or export_row.object_path is null
    or export_row.checksum is null
    or export_row.duration_seconds is null
    or export_row.duration_seconds <= 0 then
    raise exception 'Export is not a verified MP4 artifact' using errcode = '23514';
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
    export_row.id,
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
    'publish_deck_to_screen',
    'screen',
    screen_before.id,
    to_jsonb(screen_before),
    jsonb_build_object(
      'screen', to_jsonb(screen_after),
      'deck_version_id', deck_version.id,
      'export_id', export_row.id,
      'publish_event_id', event_id,
      'comment', publish_comment
    )
  );

  return query select screen_after.id, deck_version.id, export_row.id, event_id, screen_after.status, publish_time;
end;
$$;

revoke all on function public.approve_menu_version(uuid, text) from public;
revoke all on function public.approve_deck_version(uuid, text) from public;
revoke all on function public.publish_deck_to_screen(uuid, uuid, uuid, text) from public;

grant execute on function public.approve_menu_version(uuid, text) to authenticated;
grant execute on function public.approve_deck_version(uuid, text) to authenticated;
grant execute on function public.publish_deck_to_screen(uuid, uuid, uuid, text) to authenticated;
