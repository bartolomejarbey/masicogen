-- Uložení šablony z vizuálního editoru: vždy nová immutable verze,
-- optimistická kontrola base_version (konflikt = jiný uživatel uložil dřív).

create or replace function public.save_template_version(
  target_org_id uuid,
  target_template_slug text,
  template_manifest jsonb,
  base_version integer default null
)
returns table (
  template_id uuid,
  template_version_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  template_row public.templates%rowtype;
  latest_version integer;
  next_version integer;
  version_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not private.is_org_member(target_org_id, array['owner', 'admin', 'designer']::public.org_role[]) then
    raise exception 'Designer role required' using errcode = '42501';
  end if;

  if target_template_slug is null or length(trim(target_template_slug)) = 0 then
    raise exception 'Template slug is required' using errcode = '23502';
  end if;

  if jsonb_typeof(template_manifest) <> 'object'
    or (template_manifest->>'schemaVersion')::integer is distinct from 2
    or jsonb_typeof(template_manifest->'layers') <> 'array' then
    raise exception 'Template manifest must be schemaVersion 2 with layers' using errcode = '22023';
  end if;

  if (template_manifest#>>'{canvas,width}')::integer is distinct from 1920
    or (template_manifest#>>'{canvas,height}')::integer is distinct from 1080 then
    raise exception 'Template manifest has unsupported canvas' using errcode = '22023';
  end if;

  insert into public.templates (org_id, slug, name, kind)
  values (
    target_org_id,
    target_template_slug,
    coalesce(template_manifest->>'name', target_template_slug),
    coalesce(template_manifest->>'templateKind', 'daily_menu')
  )
  on conflict (org_id, slug) do update set name = excluded.name
  returning * into template_row;

  -- Zámek proti souběžné editaci.
  select * into template_row
  from public.templates
  where org_id = target_org_id and id = template_row.id
  for update;

  select max(tv.version)
  into latest_version
  from public.template_versions tv
  where tv.org_id = target_org_id
    and tv.template_id = template_row.id;

  if base_version is not null and latest_version is not null and latest_version <> base_version then
    raise exception 'Template version conflict: someone saved version % in the meantime', latest_version
      using errcode = '55000';
  end if;

  next_version := coalesce(latest_version, 0) + 1;

  insert into public.template_versions (org_id, template_id, version, manifest_json, created_by)
  values (target_org_id, template_row.id, next_version, template_manifest, actor_id)
  returning id into version_id;

  update public.templates
  set current_version_id = version_id
  where org_id = target_org_id and id = template_row.id;

  insert into public.audit_log (
    org_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_json
  )
  values (
    target_org_id,
    actor_id,
    'save_template_version',
    'template_version',
    version_id,
    jsonb_build_object(
      'template_id', template_row.id,
      'slug', target_template_slug,
      'version', next_version,
      'base_version', base_version
    )
  );

  return query select template_row.id, version_id, next_version;
end;
$$;

revoke all on function public.save_template_version(uuid, text, jsonb, integer) from public;
grant execute on function public.save_template_version(uuid, text, jsonb, integer) to authenticated;
