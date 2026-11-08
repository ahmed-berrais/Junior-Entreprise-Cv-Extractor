-- S3-05: a company's shortlist, with a private note per candidate ("great CV, call back for an interview").
-- One row per company and profile. Only that company ever reads or changes it: not another company, not
-- the candidate, not the admin.

create table public.shortlists (
  -- Deleting the company or the profile (S2-16: nothing about a deleted user is kept) removes the row.
  company_id  uuid not null references public.companies (user_id) on delete cascade,
  profile_id  uuid not null references public.profiles (user_id) on delete cascade,
  note        text not null default '' check (char_length(note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, profile_id)
);
create index shortlists_company_recent on public.shortlists (company_id, created_at desc);

-- Rule 3: RLS. The app writes with the company's own client, so these policies are the whole lock.
alter table public.shortlists enable row level security;
revoke all on public.shortlists from anon, authenticated;
grant select, insert, delete on public.shortlists to authenticated;
grant update (note, updated_at) on public.shortlists to authenticated;

create policy "active companies read their own shortlist" on public.shortlists
  for select to authenticated using (company_id = auth.uid() and public.is_active_company());
-- Only a profile the company can see (approved, not hidden: the profiles policy decides inside exists).
create policy "active companies shortlist a visible profile" on public.shortlists
  for insert to authenticated with check (
    company_id = auth.uid() and public.is_active_company()
    and exists (select 1 from public.profiles p where p.user_id = profile_id));
create policy "active companies change their own notes" on public.shortlists
  for update to authenticated using (company_id = auth.uid() and public.is_active_company())
  with check (company_id = auth.uid());
create policy "active companies remove from their own shortlist" on public.shortlists
  for delete to authenticated using (company_id = auth.uid() and public.is_active_company());
