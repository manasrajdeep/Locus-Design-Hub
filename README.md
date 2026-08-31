# Locus Design Hub

Client portal and CMS-driven public site for Locus Design — a construction and
design-build firm.

- **Public site** — homepage content (hero, stats, services, portfolio, case
  studies, engineering sections) is fully CMS-driven and editable in-app.
- **Client portal** — per-project milestones, a dated site-photo timeline,
  contracts and invoices, and realtime chat with the project team.
- **Staff admin** — provision client projects, advance milestones, post site
  updates and upload documents.
- **Superadmin CMS** — draft/publish workflow for the public homepage, with
  version history and one-click rollback.

## Stack

- TanStack Start (SSR) + TanStack Router + TanStack Query
- React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- Supabase — Postgres with row-level security, Auth, Storage, Realtime
- Playwright for end-to-end tests, Lighthouse for Core Web Vitals budgets

## Development

Requires [Bun](https://bun.sh). `bun.lock` is the authoritative lockfile.

```sh
bun install
bun run dev
```

The dev server listens on http://localhost:8080.

### Environment

Copy the required values into `.env`:

| Variable                                                     | Purpose                                           |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL`                         | Supabase project URL                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key                            |
| `VITE_SUPABASE_PROJECT_ID` / `SUPABASE_PROJECT_ID`           | Supabase project ref                              |
| `VITE_SITE_URL` / `SITE_URL`                                 | Public origin, e.g. `https://locusdesign.example` |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | Server-only; admin operations                     |
| `RLS_AUDIT_SUPABASE_URL`                                     | Throwaway project for the isolation audit         |
| `RLS_AUDIT_SUPABASE_PUBLISHABLE_KEY`                         | Publishable key for that audit project            |
| `RLS_AUDIT_SUPABASE_SERVICE_ROLE_KEY`                        | Service-role key for that audit project           |
| `VITE_SENTRY_DSN`                                            | Browser error tracking; blank disables it         |
| `SENTRY_DSN`                                                 | Worker error tracking; blank disables it          |

`VITE_SITE_URL` is the single source of truth for the canonical tag, Open Graph
URLs, JSON-LD, `/sitemap.xml`, `/robots.txt` and the search-engine submissions.
Set it once in `src/lib/site.ts`'s environment — never hardcode a host elsewhere.

## Scripts

```sh
bun run dev              # dev server
bun run build            # production build
bun run lint             # eslint (includes prettier)
bun run format           # prettier --write
bun run test:e2e         # Playwright suite
bun run test:cwv         # Lighthouse CWV budgets
bun run images:manifest  # regenerate src/lib/image-variants.ts
```

## Error tracking

Errors report to [Sentry](https://sentry.io) when a DSN is configured, and are
completely inert when it is blank — an unconfigured deploy behaves exactly as it
did before.

Two SDKs, because the app runs in two runtimes. The browser uses
`@sentry/react`, initialised from `getRouter()` (this project has no separate
client entry). The server is a Cloudflare Worker — the Nitro build targets
`cloudflare-module` — so it uses `@sentry/cloudflare`. `@sentry/node`, and
therefore the `@sentry/tanstackstart-react` SDK that depends on it, cannot run
in that runtime.

Reporting is explicit rather than automatic, because this app deliberately
swallows errors to render a friendly page: the root error boundary, the request
middleware in `src/start.ts`, and the SSR wrapper in `src/server.ts` each catch
and report. Left to Sentry's global handlers alone, none of those would surface.

Tracing and Session Replay are off by default. Replay in particular records the
DOM, and this app renders client contracts, invoices and private project chat —
turn it on only with a scrubbing policy you have chosen deliberately.

## Database

Migrations live in `supabase/migrations/` and are applied in filename order.
Every table has row-level security enabled; the security-definer helpers
(`has_role`, `is_staff`, `can_access_project`) live in the `private` schema and
are not callable by `anon`.

`/diagnostics` is superadmin-only. It exposes a tenant-isolation audit that
provisions two throwaway customers and asserts neither can read or write the
other's data.

That audit seeds and deletes real users, projects and storage objects with a
service-role key, so it runs against a **separate** Supabase project configured
through the `RLS_AUDIT_*` variables — one with these same migrations applied. It
refuses to start when those are unset, or when they resolve to the project the
app itself is serving. There is deliberately no fallback to the app's own
credentials: a fallback is how it would quietly start seeding production again.
