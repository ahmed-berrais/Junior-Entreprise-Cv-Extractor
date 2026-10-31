-- S2-06: the admin counts, the candidate list and deleting a profile. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Start from a known state: the counts below are exact.
delete from public.extraction_jobs; delete from public.profile_drafts;
delete from public.profiles; delete from public.companies;
delete from auth.users;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'amira@test.local', '{"role":"candidate"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'youssef@test.local', '{"role":"candidate"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'no-cv-yet@test.local', '{"role":"candidate"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'company@test.local', '{"role":"company"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local', '{"role":"admin"}');

insert into public.companies (user_id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Acme');
insert into public.profiles (user_id, status, hidden, data, approved_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'approved', false, '{"basics":{"name":"Amira Ben Salah"}}', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'draft', true, '{}', null);
insert into public.profile_drafts (user_id, data) values
  ('00000000-0000-0000-0000-0000000000a2', '{"basics":{"name":"Youssef Trabelsi"}}');
insert into public.extraction_jobs (user_id, kind, status, error_message, file_path, finished_at) values
  ('00000000-0000-0000-0000-0000000000a2', 'extract', 'queued', null, 'a2/cv.pdf', null),
  ('00000000-0000-0000-0000-0000000000a2', 'extract', 'failed', 'We could not read this file.', null, now()),
  ('00000000-0000-0000-0000-0000000000a1', 'extract', 'failed', 'Old failure', null, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000a1', 'extract', 'done', null, null, now()),
  ('00000000-0000-0000-0000-0000000000a1', 'embed', 'done', null, null, now());

-- ── counts ───────────────────────────────────────────────────────────────
select is((public.admin_stats() ->> 'candidates')::int, 3, 'every candidate account counts, even without a CV');
select is((public.admin_stats() ->> 'approved_profiles')::int, 1, 'approved profiles');
select is((public.admin_stats() ->> 'draft_profiles')::int, 1, 'draft profiles');
select is((public.admin_stats() ->> 'hidden_profiles')::int, 1, 'hidden profiles');
select is((public.admin_stats() ->> 'companies')::int, 1, 'companies');
select is((public.admin_stats() ->> 'jobs_queued')::int, 1, 'queued jobs');
select is((public.admin_stats() ->> 'jobs_failed_today')::int, 1, 'a failure from 3 days ago is not "today"');
select is((public.admin_stats() ->> 'jobs_done_today')::int, 2, 'jobs done today, extract and embed');

-- ── candidate list ───────────────────────────────────────────────────────
select is((select count(*)::int from public.admin_candidates()), 2, 'one row per profile');
select is((select name from public.admin_candidates() where email = 'amira@test.local'),
          'Amira Ben Salah', 'the name comes from the approved profile');
select is((select name from public.admin_candidates() where email = 'youssef@test.local'),
          'Youssef Trabelsi', '... or from the draft when there is no approved data');

-- ── failed jobs ──────────────────────────────────────────────────────────
select is((select count(*)::int from public.admin_failed_jobs()), 2, 'every failed job, old ones too');
select is((select error_message from public.admin_failed_jobs() limit 1), 'We could not read this file.',
          'newest first');
select is((select who from public.admin_failed_jobs() limit 1), 'Youssef Trabelsi', 'with the candidate''s name');
insert into public.extraction_jobs (user_id, kind, status, error_message, finished_at) values
  ('00000000-0000-0000-0000-0000000000a3', 'extract', 'failed', 'No profile yet', now() + interval '1 minute');
select is((select who from public.admin_failed_jobs() limit 1), 'no-cv-yet@test.local',
          '... or their email when there is no name yet');
delete from public.extraction_jobs where error_message = 'No profile yet';

-- ── delete ───────────────────────────────────────────────────────────────
select is(public.admin_delete_profile('00000000-0000-0000-0000-0000000000a2'), array['a2/cv.pdf'],
          'deleting returns the temporary file still waiting, so the server removes it');
select is((select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a2')
        + (select count(*)::int from public.profile_drafts where user_id = '00000000-0000-0000-0000-0000000000a2')
        + (select count(*)::int from public.extraction_jobs where user_id = '00000000-0000-0000-0000-0000000000a2'),
          0, 'profile, draft and jobs are gone');
select ok(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a2'),
          'the login stays: the person can start again');
select is(public.admin_delete_profile('00000000-0000-0000-0000-0000000000a2'), null,
          'deleting a profile that does not exist returns null');

-- ── a deleted profile disappears for companies ───────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","app_metadata":{"role":"company"}}', true);
set local role authenticated;
select is((select count(*)::int from public.profiles), 1, 'the company sees the approved profile ...');
reset role;
select public.admin_delete_profile('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select is((select count(*)::int from public.profiles), 0, '... and no longer once it is deleted');
reset role;

-- ── only the server may call them ────────────────────────────────────────
set local role authenticated;
select throws_ok('select public.admin_stats()', '42501', null, 'a logged-in user cannot read the counts');
select throws_ok('select * from public.admin_failed_jobs()', '42501', null, 'a logged-in user cannot read the failures');
select throws_ok($$select public.admin_delete_profile('00000000-0000-0000-0000-0000000000a1')$$,
                 '42501', null, 'a logged-in user cannot delete a profile');
reset role;

select * from finish();
rollback;
