# Sprint 2 implementation

Tasks: S2-01 (`123tzfxyecf`), S2-04 (`123tzfxyecj`), S2-05 (`123tzfxyeck`),
S2-07 (`123tzfxyecn`), S2-15 (`123tzfxyecx`).

## Delivery

- Role gates, server API checks, admin login, one-time admin seed and `ACCESS.md`.
- Admin company creation, list, fresh-code resend, disable and enable. Codes use Node crypto,
  have ten unambiguous characters, are used as Supabase passwords, and never appear in API
  responses, database columns or logs. Resend replaces the password before mailing.
- Company login checks both role and live disabled state, with English/French errors.
- Company management uses server-loaded initial data, confirmations and refreshed table data
  after actions, without a page reload.
- Candidate profile view, stable QR download link, hidden/visible switch and approved-profile
  editing through the existing review form. Save uses an owner/version-checked database
  function and queues a fresh embedding in the same transaction. Hidden stays unchanged.

Apply both new migrations before running the app. `companies.email` permits admin listing
without enumerating all Supabase Auth users; browser update grants do not include email.
The `edit_approved_profile` function is executable only by the service role.

## Email configuration and failure recovery

`nodemailer` is the only new runtime dependency, as required by S2-04. Configure
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `APP_URL` server-side. Port 465 uses
implicit TLS; other ports require STARTTLS. The sender is the club's configured SMTP account.
Mail contains English and French access instructions. The S1-27 approved template is not in
the main branch; reconcile this provisional plain-text copy with it before acceptance.

If creation succeeds but SMTP fails, the row remains and the UI explains that a resend is
needed. Resend always produces a new code; the old code stays invalid even if delivery fails.
Disabling changes the live DB flag: existing sessions also lose page/API access and RLS visibility.

## Integration dependencies

- S2-10's `/company/cvs` grid is not in main. A temporary translated landing page keeps login
  from ending in a 404; replace it with that task's screen when integrated.
- S2-16 account deletion is integrated from team PR #27. The profile's delete control requires
  the exact confirmation `DELETE`, calls `POST /api/candidate/delete`, and redirects to `/`
  only on success. The server removes temporary uploads before deleting the Auth account;
  foreign-key cascades remove the profile, drafts and jobs. Errors remain visible in the form.
  Re-upload links to the existing candidate upload flow.
- Company/admin mockups from S2-02/S2-03 are not in this checkout. These screens use the
  existing club UI components and need visual comparison when those mockups are available.

## Acceptance on local Supabase/staging

1. Apply migrations, seed a test admin and sign in at `/admin/login`.
2. Add a company using a controlled mailbox; verify the delivered code logs in at
   `/company/login` and redirects to `/company/cvs`.
3. Confirm Resend, verify old code fails and delivered replacement works.
4. Disable an already signed-in company. Both its next page/API request and RLS profile read
   must be refused. Enable restores access.
5. Test the page role matrix (candidate/company/admin/logged out) and candidate → admin API 403.
6. Approve a candidate, edit their profile, verify the changed data and queued embedding.
   Hide the profile and verify it disappears from company RLS reads; show it again.
7. Verify both languages and mobile layout. Download/scan the QR again; its public ID is stable.
8. With a disposable test candidate, verify an incorrect delete confirmation is refused;
   after `DELETE`, verify the session, profile, jobs and temporary uploads are removed.

Unit tests and lint can run without credentials. API tests need the running app and local
Supabase; SMTP delivery and UI acceptance require the controlled mailbox and staging setup.

## Validation in this checkout

- Unit coverage includes the three-role/logged-out matrix, access-code padding, company
  search and deletion confirmation. Re-run the suite after each integration update.
- ESLint passed; TypeScript `--noEmit --incremental false` passed.
- `git diff --check` passed.
- The local production build was blocked while loading Next config by the Windows SWC native
  compiler cache (`ERR_SWC_NATIVE_CACHE`, access denied / cache ownership validation).
  No compiler security checks were disabled. GitHub Actions provides the Linux build check.
- API/database tests, including S2-16's disposable-account deletion checks, run in GitHub
  Actions with local Supabase; they cannot run on this Windows checkout without Docker.
- No real admin was seeded, no production migration applied and no real email was sent.
- Root layout now declares its `children` type explicitly, so standalone TypeScript checking
  does not depend on Next's generated `LayoutProps` file.
