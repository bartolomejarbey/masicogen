alter table public.exports
  drop constraint if exists exports_org_render_job_unique;

alter table public.exports
  add constraint exports_org_render_job_unique unique (org_id, render_job_id);
