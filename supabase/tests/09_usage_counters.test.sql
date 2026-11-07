-- S3-10: AI calls and emails are counted per day, and only the server can count or read them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select is((select relrowsecurity from pg_class where oid = 'public.usage_counters'::regclass), true,
  'usage_counters has row-level security');

-- ── counting, as the role the server and the worker use ──────────────────
set local role service_role;
select lives_ok($$ select public.count_usage('gemini-3.5-flash-lite') $$, 'the service role can count');
select public.count_usage('gemini-3.5-flash-lite');
select public.count_usage('email:company');
select set_eq($$ select kind, n from public.usage_today() $$,
  $$ values ('email:company', 1), ('gemini-3.5-flash-lite', 2) $$,
  'two calls of the same kind add up; each kind has its own count');
reset role;

-- ── "today" is Google's day (midnight Pacific), not an older one ──────────
insert into public.usage_counters (day, kind, n)
values ((now() at time zone 'America/Los_Angeles')::date - 1, 'gemini-3.5-flash', 20);
select is((select count(*)::int from public.usage_today() where kind = 'gemini-3.5-flash'), 0,
  'yesterday''s count is not in today''s');

select throws_ok($$ select public.count_usage('Not A Kind!') $$, '23514', null,
  'a kind outside [a-z0-9:._-] is refused');

-- ── a logged-in user (candidate or company) and a visitor can do nothing ─
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000c1', 'role', 'authenticated',
  'app_metadata', json_build_object('role', 'company'))::text, true);
set local role authenticated;
select throws_ok($$ select * from public.usage_counters $$, '42501', null, 'a company cannot read the table');
select throws_ok($$ select * from public.usage_today() $$, '42501', null, 'a company cannot call usage_today()');
select throws_ok($$ select public.count_usage('email:company') $$, '42501', null, 'a company cannot count');
reset role;

set local role anon;
select throws_ok($$ select * from public.usage_counters $$, '42501', null, 'a visitor cannot read the table');
select throws_ok($$ select public.count_usage('email:company') $$, '42501', null, 'a visitor cannot count');
reset role;

select * from finish();
rollback;
