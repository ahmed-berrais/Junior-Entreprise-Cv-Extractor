-- S3-10: how many AI calls and emails we made today, so the admin sees a free limit coming before it
-- breaks (limits: docs/AI_LIMITS.md). One row per day and kind: a model name such as
-- 'gemini-3.5-flash-lite', or 'email:company' / 'email:auth'.
--
-- "Today" is Google's day, not Tunisia's: Gemini's daily quotas reset at midnight Pacific time
-- (9:00 in Tunis), so a count from Tunisian midnight would not match what Google has counted.
create table public.usage_counters (
  day date not null,
  kind text not null check (kind ~ '^[a-z0-9:._-]{1,64}$'),
  n integer not null default 0,
  primary key (day, kind)
);

-- No policy and no browser grant: only the server (service role) reads and writes it, through the
-- two functions below (rule 3, same pattern as 20261028110000_access_rules.sql).
alter table public.usage_counters enable row level security;
revoke all on public.usage_counters from anon, authenticated;

-- One statement, so two calls at the same moment can't lose a count.
create function public.count_usage(p_kind text) returns void
language sql set search_path = '' as $$
  insert into public.usage_counters (day, kind, n)
  values ((now() at time zone 'America/Los_Angeles')::date, p_kind, 1)
  on conflict (day, kind) do update set n = public.usage_counters.n + 1;
$$;

create function public.usage_today() returns table (kind text, n integer)
language sql stable set search_path = '' as $$
  select kind, n from public.usage_counters
   where day = (now() at time zone 'America/Los_Angeles')::date
   order by kind;
$$;

revoke execute on function public.count_usage(text) from public, anon, authenticated;
revoke execute on function public.usage_today() from public, anon, authenticated;
grant execute on function public.count_usage(text) to service_role;
grant execute on function public.usage_today() to service_role;
