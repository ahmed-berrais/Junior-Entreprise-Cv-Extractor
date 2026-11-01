# Access by route (S2-01)

Roles come only from verified Supabase `app_metadata.role`. Unknown roles have no access.
Proxy refreshes cookies and redirects pages; handlers check authentication again before using
the service-role client. A company's row must exist and `disabled` must be false on every request.
RLS also excludes disabled companies and hidden/unapproved profiles.

| Route | Allowed |
| --- | --- |
| `/`, `/privacy`, `/styleguide`, `/whoami` | Public (whoami reveals only the visitor's session) |
| `/candidate/login`, `/candidate/signup`, `/candidate/forgot-password`, `/candidate/reset-password` | Public auth forms |
| `/company/login`, `/admin/login` | Public auth forms; signed-in roles go to their own space |
| `/auth/callback` | Public token verification |
| `/candidate`, `/candidate/upload`, `/candidate/processing/:id`, `/candidate/review`, `/candidate/approved`, `/candidate/profile`, `/candidate/profile/edit`, `/candidate/account` | Candidate |
| `/company/cvs`, `/company/cvs/*`, `/p`, `/p/*` | Active company or admin (CV inspection) |
| Other `/company/*` pages and `/api/company/*` | Active company only (apart from public login/auth) |
| `/admin/*` | Admin (apart from login) |
| `POST /api/candidate/auth` | Public action endpoint; validates Origin and credentials; login requires candidate role; logout works for every role |
| `POST /api/company/auth`, `POST /api/admin/auth` | Public; same Origin, verified credentials and correct role required |
| `POST /api/cv/upload`, `GET /api/cv/jobs/:id` | Confirmed candidate; own jobs only |
| `POST /api/profile/approve`, `POST /api/profile/visibility` | Confirmed candidate; own profile only |
| `GET /api/admin/companies` | Admin |
| `POST /api/admin/companies` | Admin, same Origin |
| `POST /api/admin/companies/:id/{resend,disable,enable}` | Admin, same Origin |
| `saveProfileDraft`, `saveApprovedProfile` server actions | Confirmed candidate; owner derived from verified session; version checked |

Logged-out page requests go to the area's login. A wrong-role visitor goes to their own space.
API requests get 401 when logged out or 403 for a wrong role; redirects never replace API errors.
Static-looking suffixes do not bypass protected routes.
The matcher deliberately omits image-extension exclusions: excluding every `.png`, for
example, would skip authentication on `/p/private.png` as well. There are no public images
yet. When adding them, use explicit protected-prefix matchers before excluding public-image
requests, and verify both paths with Next's matcher test helper.

## Administrator seed

Run once against the intended environment:

```sh
node --env-file=.env.local --import tsx scripts/seed-admin.ts
```

Supply `ADMIN_EMAIL` (Ahmed's intended admin address), `ADMIN_PASSWORD` (12+ characters),
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` privately. Existing accounts are
never silently promoted or overwritten. Remove seed-only variables afterwards. No admin account
is created automatically by deploying or building the app.
