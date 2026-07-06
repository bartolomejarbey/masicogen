alter table public.exports
  drop constraint if exists exports_object_path_org_scope;

alter table public.exports
  add constraint exports_object_path_org_scope
  check (private.storage_org_id(object_path) = org_id);
