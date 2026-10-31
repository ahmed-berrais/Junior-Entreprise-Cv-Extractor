-- S2-06: what the admin dashboard reads and does. Four functions, called only by the server
-- (app/admin and /api/admin/...) after it has checked that the caller is the admin. The browser
-- can't run them: they read auth.users (emails) and delete data.
-- Tests: supabase/tests/07_admin_overview.test.sql.

-- "Today" is the day in Tunisia, where the fair happens: failed and done jobs since local midnight.
create function public.admin_stats() returns jsonb
language sql stable set search_path = '' as $$
  with today as (
    select (date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis') as since
  )
  select jsonb_build_object(
    -- Every candidate account, including those who signed up but haven't uploaded a CV yet.
    'candidates',        (select count(*) from auth.users u where u.raw_app_meta_data ->> 'role' = 'candidate'),
    'approved_profiles', (select count(*) from public.profiles where status = 'approved'),
    'draft_profiles',    (select count(*) from public.profiles where status = 'draft'),
    'hidden_profiles',   (select count(*) from public.profiles where hidden),
    'companies',         (select count(*) from public.companies),
    'jobs_queued',       (select count(*) from public.extraction_jobs where status = 'queued'),
    'jobs_failed_today', (select count(*) from public.extraction_jobs, today
                           where status = 'failed' and coalesce(finished_at, updated_at) >= today.since),
    'jobs_done_today',   (select count(*) from public.extraction_jobs, today
                           where status = 'done' and coalesce(finished_at, updated_at) >= today.since)
  )
$$;

-- One row per candidate who has a profile (draft or approved), newest first, with their login email
-- and the name from the approved profile, or from the draft the AI extracted.
create function public.admin_candidates()
returns table (
  user_id uuid, email text, name text, status text, hidden boolean,
  looking_for text, created_at timestamptz, approved_at timestamptz
)
language sql stable set search_path = '' as $$
  select p.user_id,
         u.email::text,
         coalesce(nullif(p.data #>> '{basics,name}', ''), d.data #>> '{basics,name}'),
         p.status, p.hidden, p.looking_for, p.created_at, p.approved_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.profile_drafts d on d.user_id = p.user_id
   order by p.created_at desc
$$;

-- The latest failed jobs, newest first, with who they belong to (the name if known, else the email).
-- Ahmed's note: many failures with the same message mean the AI quota or a key is the problem.
create function public.admin_failed_jobs(p_limit int default 50)
returns table (
  id uuid, user_id uuid, who text, kind text, error_message text, attempts int, failed_at timestamptz
)
language sql stable set search_path = '' as $$
  select j.id, j.user_id,
         coalesce(nullif(p.data #>> '{basics,name}', ''), d.data #>> '{basics,name}', u.email::text),
         j.kind, j.error_message, j.attempts, coalesce(j.finished_at, j.updated_at)
    from public.extraction_jobs j
    left join auth.users u on u.id = j.user_id
    left join public.profiles p on p.user_id = j.user_id
    left join public.profile_drafts d on d.user_id = j.user_id
   where j.status = 'failed'
   order by coalesce(j.finished_at, j.updated_at) desc
   limit least(greatest(p_limit, 1), 200)
$$;

-- Deletes a candidate's profile, draft and jobs in one step (junk or abuse). The login stays, so a
-- real person can start again; the profile disappears from browsing and search at once.
-- Returns the temporary CV files still waiting in uploads-tmp, so the server removes them too
-- (rule 2: no CV file is kept). Returns null if there was no profile.
create function public.admin_delete_profile(p_user_id uuid) returns text[]
language plpgsql set search_path = '' as $$
declare
  v_files text[];
begin
  delete from public.profiles where user_id = p_user_id;
  if not found then
    return null;
  end if;
  delete from public.profile_drafts where user_id = p_user_id;
  with gone as (
    delete from public.extraction_jobs where user_id = p_user_id returning file_path
  )
  select coalesce(array_agg(file_path) filter (where file_path is not null), '{}') into v_files from gone;
  return v_files;
end $$;

revoke execute on function public.admin_stats() from public, anon, authenticated;
revoke execute on function public.admin_candidates() from public, anon, authenticated;
revoke execute on function public.admin_failed_jobs(int) from public, anon, authenticated;
revoke execute on function public.admin_delete_profile(uuid) from public, anon, authenticated;
grant execute on function public.admin_stats() to service_role;
grant execute on function public.admin_candidates() to service_role;
grant execute on function public.admin_failed_jobs(int) to service_role;
grant execute on function public.admin_delete_profile(uuid) to service_role;
