-- S3-05: a company's shortlist and private notes. Each test logs in the way the app does (the company's
-- own client, role authenticated), because the policies are the whole lock: the app writes with that client.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.login(uid uuid, app_role text) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  set local role authenticated;
$$;

-- a1, a2: active companies · ad: disabled company · c1, c2: approved · ch: hidden · cd: draft · z: admin
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local'),
  ('00000000-0000-0000-0000-0000000000ad', 'ad@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test.local'),
  ('00000000-0000-0000-0000-0000000000ce', 'ch@test.local'),
  ('00000000-0000-0000-0000-0000000000cd', 'cd@test.local'),
  ('00000000-0000-0000-0000-0000000000ff', 'z@test.local');
insert into public.companies (user_id, name, disabled) values
  ('00000000-0000-0000-0000-0000000000a1', 'Acme', false),
  ('00000000-0000-0000-0000-0000000000a2', 'Beta', false),
  ('00000000-0000-0000-0000-0000000000ad', 'Gone', true);
insert into public.profiles (user_id, status, hidden) values
  ('00000000-0000-0000-0000-0000000000c1', 'approved', false),
  ('00000000-0000-0000-0000-0000000000c2', 'approved', false),
  ('00000000-0000-0000-0000-0000000000ce', 'approved', true),
  ('00000000-0000-0000-0000-0000000000cd', 'draft',    false);
-- Beta's own row, and one for the disabled company (from before it was turned off).
insert into public.shortlists (company_id, profile_id, note) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', 'Beta''s private note'),
  ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000c1', 'old note');

-- ── a company manages its own shortlist ──────────────────────────────────
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'company');
select lives_ok($$ insert into public.shortlists (company_id, profile_id, note)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'great CV, call back') $$,
  'a company shortlists a visible profile, with a note');
select lives_ok($$ update public.shortlists set note = 'interview Monday', updated_at = now()
  where profile_id = '00000000-0000-0000-0000-0000000000c1' $$, 'it changes its note');
select results_eq($$ select note from public.shortlists $$, $$ values ('interview Monday') $$,
  'it reads only its own shortlist, with the new note: not Beta''s');
select throws_ok($$ insert into public.shortlists (company_id, profile_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1') $$,
  '23505', null, 'the same profile can''t be shortlisted twice');
select throws_ok($$ insert into public.shortlists (company_id, profile_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ce') $$,
  '42501', null, 'a hidden profile can''t be shortlisted');
select throws_ok($$ insert into public.shortlists (company_id, profile_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000cd') $$,
  '42501', null, 'a draft profile can''t be shortlisted');
select throws_ok($$ insert into public.shortlists (company_id, profile_id)
  values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2') $$,
  '42501', null, 'nobody adds to another company''s shortlist');
select throws_ok($$ update public.shortlists set note = repeat('x', 1001)
  where profile_id = '00000000-0000-0000-0000-0000000000c1' $$,
  '23514', null, 'a note is 1,000 characters at most');
select throws_ok($$ update public.shortlists set company_id = '00000000-0000-0000-0000-0000000000a2' $$,
  '42501', null, 'a row can''t be moved to another company');
select results_eq($$ with u as (update public.shortlists set note = 'hacked'
  where company_id = '00000000-0000-0000-0000-0000000000a2' returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'another company''s note can''t be changed');
select results_eq($$ with d as (delete from public.shortlists
  where company_id = '00000000-0000-0000-0000-0000000000a2' returning 1) select count(*)::int from d $$,
  $$ values (0) $$, 'another company''s shortlist can''t be emptied');
select results_eq($$ with d as (delete from public.shortlists
  where profile_id = '00000000-0000-0000-0000-0000000000c1' returning 1) select count(*)::int from d $$,
  $$ values (1) $$, 'a company removes a profile from its own shortlist');
reset role;

-- ── nobody else sees the notes ───────────────────────────────────────────
select pg_temp.login('00000000-0000-0000-0000-0000000000c1', 'candidate');
select is_empty($$ select 1 from public.shortlists $$, 'the candidate never sees who shortlisted them, or the notes');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000ff', 'admin');
select is_empty($$ select 1 from public.shortlists $$, 'the admin doesn''t read companies'' private notes');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000ad', 'company');
select is_empty($$ select 1 from public.shortlists $$, 'a disabled company reads nothing, not even its old rows');
reset role;
set local role anon;
select throws_ok($$ select 1 from public.shortlists $$, '42501', null, 'a visitor can''t read the table');
reset role;

-- ── a deleted profile leaves nothing behind ──────────────────────────────
delete from public.profiles where user_id = '00000000-0000-0000-0000-0000000000c1';
select is((select count(*)::int from public.shortlists), 0, 'deleting a profile removes it from every shortlist');

select * from finish();
rollback;
