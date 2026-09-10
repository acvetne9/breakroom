-- Job dates live only in the database; nothing in the UI edits them.
--
--   current_jobs.created_at  when the job was first added (preserved across edits: the
--                            client upserts without touching it)
--   past_jobs.created_at     when the row became a past job
--   past_jobs.started_at     when it was first added as a current job, carried over by
--                            move_current_job_to_past; NULL for jobs entered directly as past

alter table public.past_jobs
  add column if not exists started_at timestamptz;

comment on column public.past_jobs.started_at is 'created_at of the current_jobs row this came from, if any';
comment on column public.past_jobs.created_at is 'When this became a past job';
comment on column public.current_jobs.created_at is 'When the job was first added; edits only bump updated_at';

create or replace function public.move_current_job_to_past()
returns uuid
language plpgsql
security invoker
as $$
declare
  cj public.current_jobs%rowtype;
  new_id uuid;
begin
  select * into cj
  from public.current_jobs
  where profile_id::text = public.current_device_id()
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.past_jobs (profile_id, role, salary, location, business_name, business_id, time_period, started_at)
  values (cj.profile_id, coalesce(cj.role, ''), cj.salary, cj.location, cj.business_name, cj.business_id, cj.time_period, cj.created_at)
  returning id into new_id;

  delete from public.current_jobs where id = cj.id;

  return new_id;
end;
$$;
