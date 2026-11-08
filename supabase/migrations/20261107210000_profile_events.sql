-- S3-19: profile views and QR scans per company, for "CVs viewed today", "scans at the stand" and
-- the last candidates scanned in the company space (S3-20, achraf's S2-02 mockup, screen 2).
-- "Today" = since midnight Tunisia time, like admin_stats() (S2-06).

create table public.profile_events (
  id          bigint generated always as identity primary key,
  -- Deleting a profile (S2-06) or an account removes its events (S2-16: nothing about a deleted user is kept).
  company_id  uuid not null references public.companies (user_id) on delete cascade,
  profile_id  uuid not null references public.profiles (user_id) on delete cascade,
  kind        text not null check (kind in ('view', 'scan')),
  day         date not null default (now() at time zone 'Africa/Tunis')::date,
  created_at  timestamptz not null default now()
);

-- A view counts once per company, per profile, per day: opening the same profile again changes nothing.
-- Scans are all kept: scanning the same student twice at the stand is two scans.
create unique index profile_events_one_view_a_day on public.profile_events (company_id, profile_id, day)
  where kind = 'view';
create index profile_events_company_recent on public.profile_events (company_id, created_at desc);

-- Rule 3: RLS, and nobody writes from the browser. A company reads only its own rows, and only
-- while it's active (same rule as for profiles).
alter table public.profile_events enable row level security;
revoke all on public.profile_events from anon, authenticated;
grant select on public.profile_events to authenticated;
create policy "active companies read their own events" on public.profile_events
  for select to authenticated using (company_id = auth.uid() and public.is_active_company());

-- Called by the server only (service role): it passes the company from the login session, so nobody
-- can record events for another company. Records nothing for a disabled company or a profile companies
-- can't see (draft, hidden). Returns true when a row was added (false for a repeated view the same day).
create function public.record_profile_event(p_company_id uuid, p_public_id text, p_kind text)
returns boolean
language plpgsql set search_path = '' as $$
begin
  insert into public.profile_events (company_id, profile_id, kind)
  select c.user_id, p.user_id, p_kind
    from public.companies c, public.profiles p
   where c.user_id = p_company_id and not c.disabled
     and p.public_id = p_public_id and p.status = 'approved' and not p.hidden
  on conflict (company_id, profile_id, day) where kind = 'view' do nothing;
  return found;
end $$;

revoke execute on function public.record_profile_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_profile_event(uuid, text, text) to service_role;

-- What the logged-in company sees in "My company". Runs as the caller (security invoker), so the
-- policies above and on profiles decide: another company, a candidate or a disabled company gets
-- zeros and an empty list, and a profile hidden since the scan drops out of the list.
create function public.company_stats() returns jsonb
language sql stable set search_path = '' as $$
  with since as (
    select (date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis') as t
  ), last_scans as (
    select e.profile_id, max(e.created_at) as scanned_at
      from public.profile_events e
     where e.kind = 'scan'
     group by e.profile_id
     order by scanned_at desc
     limit 10
  )
  select jsonb_build_object(
    'views_today', (select count(*) from public.profile_events e, since
                     where e.kind = 'view' and e.created_at >= since.t),
    'scans_today', (select count(*) from public.profile_events e, since
                     where e.kind = 'scan' and e.created_at >= since.t),
    'last_scanned', coalesce((
      select jsonb_agg(jsonb_build_object(
               'public_id', p.public_id,
               'name', p.data -> 'basics' ->> 'name',
               'school', p.data -> 'education' -> 0 ->> 'institution',
               'scanned_at', s.scanned_at)
             order by s.scanned_at desc)
        from last_scans s
        join public.profiles p on p.user_id = s.profile_id), '[]'::jsonb)
  )
$$;

revoke execute on function public.company_stats() from public, anon;
grant execute on function public.company_stats() to authenticated, service_role;
