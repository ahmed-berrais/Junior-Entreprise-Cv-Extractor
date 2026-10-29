# S1-30 / S1-31 review page

/candidate/review reads the signed-in candidate's profile_drafts row. It uses a
single react-hook-form FormProvider and the generated S1-15 schema for the base
fields and repeatable sections. English/French copy lives in messages/. The
locale prop is ready for S1-14; the route currently uses English.

Save draft validates structure, permits empty required values and replaces the
whole data object, including removed list items. The server action verifies the
session and candidate role, applies the owner filter and uses the existing RLS
client. It updates only data. The upload choice looking_for is read from the
owner's profiles row rather than trusted from submitted form data.

updated_at is checked on writes. A replaced, approved or concurrently modified
draft produces a conflict message, not a false success. Failed saves retain all
edits. A missing draft, load failure, invalid draft format or absent configuration
has an explicit message. No CV upload is retained by this change.

Approve validates the entire shared form, including required entry fields,
opens invalid collapsed cards and focuses an error. It saves first, then calls
POST /api/profile/approve. That endpoint is S1-32 and is not implemented here.
A 404 or other failure is displayed honestly; there is no mock approval. Expected
success response: { redirect: '/candidate/...' }. S1-32 must check the saved
updated_at to avoid approving a concurrent replacement and validate server-side.

Required values currently proposed for approval are name/email and, for added
entries, school/degree, company/role, project name, language/level, certification
name. Sections themselves are optional. Ahmed must confirm these product rules.

## Validation

npm run test:web exercises generation constraints, array deletion/editing and
save round-trips, approval blocking, and failure retention. Draft-store tests use
the real Supabase client with a fake transport to inspect owner/version filters.
worker pytest covers complete profiles, malformed values, unknown domains,
AI exclusion of looking_for and deterministic export.

Live Supabase/session tests, worker-produced drafts (S1-24), and the real S1-32
approval response still need staging verification. Do not mark acceptance complete
based only on isolated tests.
