-- Admin listings should not enumerate Auth users, and browsers cannot change the login email.
alter table public.companies add column email text;
update public.companies c set email = u.email from auth.users u where u.id = c.user_id;
create unique index companies_email_idx on public.companies (lower(email)) where email is not null;
