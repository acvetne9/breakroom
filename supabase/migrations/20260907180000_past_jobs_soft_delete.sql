-- Past jobs are hidden, not erased, and a current job can be retired in one step.

alter table public.past_jobs
  add column if not exists deleted_at timestamptz;

create index if not exists idx_past_jobs_profile_active
  on public.past_jobs (profile_id, created_at desc)
  where deleted_at is null;

-- Copy the caller's current job into past_jobs and clear it, atomically.
-- Runs as the caller, so the device-id RLS policies still apply.
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

  insert into public.past_jobs (profile_id, role, salary, location, business_name, business_id, time_period)
  values (cj.profile_id, coalesce(cj.role, ''), cj.salary, cj.location, cj.business_name, cj.business_id, cj.time_period)
  returning id into new_id;

  delete from public.current_jobs where id = cj.id;

  return new_id;
end;
$$;

grant execute on function public.move_current_job_to_past() to anon, authenticated;
