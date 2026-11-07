-- S3-19: views and QR scans per company. The counts, "today", one view a day, and nobody else sees
-- them. company_stats() is called as the role the app uses (authenticated), not only as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Log in as someone: the same JWT claims Supabase Auth puts in a real session.
create function pg_temp.login(uid uuid, app_role text) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  set local role authenticated;
$$;

-- a1, a2: active companies. ad: disabled company. c1-c3: approved candidates, ch: hidden, cd: draft.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local'),
  ('00000000-0000-0000-0000-0000000000ad', 'ad@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'c3@test.local'),
  ('00000000-0000-0000-0000-0000000000ce', 'ch@test.local'),
  ('00000000-0000-0000-0000-0000000000cd', 'cd@test.local');
insert into public.companies (user_id, name, disabled) values
  ('00000000-0000-0000-0000-0000000000a1', 'Acme', false),
  ('00000000-0000-0000-0000-0000000000a2', 'Beta', false),
  ('00000000-0000-0000-0000-0000000000ad', 'Gone', true);
insert into public.profiles (user_id, public_id, status, hidden, data) values
  ('00000000-0000-0000-0000-0000000000c1', 'pub-c1', 'approved', false,
   '{"basics": {"name": "Amira"}, "education": [{"institution": "ENIT"}]}'),
  ('00000000-0000-0000-0000-0000000000c2', 'pub-c2', 'approved', false, '{"basics": {"name": "Bilel"}}'),
  ('00000000-0000-0000-0000-0000000000c3', 'pub-c3', 'approved', false, '{"basics": {"name": "Chiraz"}}'),
  ('00000000-0000-0000-0000-0000000000ce', 'pub-ch', 'approved', true,  '{"basics": {"name": "Hidden"}}'),
  ('00000000-0000-0000-0000-0000000000cd', 'pub-cd', 'draft',    false, '{"basics": {"name": "Draft"}}');

-- ── recording, as the server does it ─────────────────────────────────────
set local role service_role;
select is(public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c1', 'view'), true,
  'a company opening a profile records a view');
select is(public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c1', 'view'), false,
  'opening the same profile again the same day doesn''t count twice');
select public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c2', 'view');
select public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c1', 'scan');
select public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c2', 'scan');
select public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c1', 'scan');
select public.record_profile_event('00000000-0000-0000-0000-0000000000a2', 'pub-c3', 'scan');
select is(public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-ch', 'view'), false,
  'a hidden profile records nothing');
select is(public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-cd', 'scan'), false,
  'a draft profile records nothing');
select is(public.record_profile_event('00000000-0000-0000-0000-0000000000ad', 'pub-c1', 'view'), false,
  'a disabled company records nothing');
select is(public.record_profile_event('00000000-0000-0000-0000-0000000000c2', 'pub-c1', 'view'), false,
  'a candidate''s id records nothing (not a company)');
select throws_ok($$ select public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c1', 'like') $$,
  '23514', null, 'only view and scan exist');
reset role;

-- One transaction gives every row the same now(): put Bilel's scan a minute earlier, so "newest first" means something.
update public.profile_events set created_at = created_at - interval '1 minute'
 where kind = 'scan' and profile_id = '00000000-0000-0000-0000-0000000000c2';

-- A scan from yesterday (Tunisia time) counts in the list but not in today's numbers.
insert into public.profile_events (company_id, profile_id, kind, day, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 'scan', current_date - 1,
   date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis' - interval '1 minute');

-- ── the company's own numbers, as the app calls it ──────────────────────
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'company');
select is((public.company_stats() ->> 'views_today')::int, 2, 'views today: 2 profiles, the repeat not counted');
select is((public.company_stats() ->> 'scans_today')::int, 3, 'scans today: every scan, yesterday''s left out');
select is((select jsonb_agg(x ->> 'name') from jsonb_array_elements(public.company_stats() -> 'last_scanned') x),
  '["Amira", "Bilel", "Chiraz"]'::jsonb, 'last scanned: one row per profile, newest first, yesterday''s too');
select is(public.company_stats() -> 'last_scanned' -> 0 ->> 'school', 'ENIT', 'the list shows the school');
select is((select count(*)::int from public.profile_events), 6, 'a company reads its own events only');
reset role;

-- ── nobody else sees them ────────────────────────────────────────────────
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'company');
select is(public.company_stats() - 'last_scanned', '{"views_today": 0, "scans_today": 1}'::jsonb,
  'another company counts only its own scan');
select is((select jsonb_agg(x ->> 'name') from jsonb_array_elements(public.company_stats() -> 'last_scanned') x),
  '["Chiraz"]'::jsonb, 'another company lists only its own scan');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1', 'candidate');
select is(public.company_stats(), '{"views_today": 0, "scans_today": 0, "last_scanned": []}'::jsonb,
  'a candidate sees nothing');
select throws_ok($$ insert into public.profile_events (company_id, profile_id, kind)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'view') $$,
  '42501', null, 'nobody writes from the browser');
select throws_ok($$ select public.record_profile_event('00000000-0000-0000-0000-0000000000a1', 'pub-c1', 'view') $$,
  '42501', null, 'the browser cannot call record_profile_event()');
reset role;

set local role anon;
select throws_ok($$ select public.company_stats() $$, '42501', null, 'a visitor cannot call company_stats()');
reset role;

-- ── a deleted profile disappears ─────────────────────────────────────────
delete from public.profiles where user_id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'company');
select is((select jsonb_agg(x ->> 'name') from jsonb_array_elements(public.company_stats() -> 'last_scanned') x),
  '["Bilel", "Chiraz"]'::jsonb, 'a deleted profile disappears from the list, with its events');
reset role;

select * from finish();
rollback;
