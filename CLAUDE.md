# SOL Golf — context for Claude

Migrated from Azure Static Web Apps (React SPA + Azure Functions + Azure
Table Storage) to Cloudflare Workers in August 2026, right after the sibling
cornhole app's migration (`c:\Dev\cornhole`) served as the pilot. See
`c:\Dev\SOLDelco`'s plan history for the full roadmap discussion — this file
covers what's specific to working in this repo post-migration.

## Architecture

- One Cloudflare Worker serves both the built Vite frontend (`dist/`, static
  assets) and the API (`worker/index.ts`, Hono, routed only for `/api/*` via
  `run_worker_first` in `wrangler.jsonc` — everything else is asset-served
  with SPA fallback).
- **Own dedicated D1 database** (`golf`, own `database_id` in
  `wrangler.jsonc`) — deliberately *not* shared with SOLDelco's or
  cornhole's D1. Unlike cornhole (which dropped its own player table and
  reads SOLDelco's `members`), golf keeps a fully independent player/auth
  system, because it's meant to eventually serve other friend groups beyond
  Sons of Liberty, not just SOL.
- **Auth is golf's own**, not SOLDelco's cookie-based identity: a
  hand-rolled HMAC-SHA256 bearer token (`worker/token.ts`, Web Crypto port of
  the old Node `crypto` version), sent by the frontend under a custom
  `X-Session-Token` header and stored in `localStorage` (`src/lib/session.ts`)
  — never a cookie. The header name is a fossil from Azure Static Web Apps
  reserving `Authorization` for its own proxy; that constraint is gone on
  Workers but the header was kept as-is to make the backend port a no-op for
  the frontend. `AUTH_SECRET` (Worker secret) must **not** be the same value
  as SOLDelco's `IDENTITY_SECRET` — these are intentionally separate identity
  systems for separate apps.
- **Multi-tenancy via Zones**: `zones` + `zone_membership` (role: admin |
  member). `players` are global, not per-zone. `events` carries an optional
  `zone_id`; `teams` and `scores` don't carry one directly — their zone is
  resolved indirectly through their parent event. The four auth guards in
  `worker/authz.ts` (`requireAuth`, `requireZoneMember`, `requireZoneAdmin`,
  `requireAnyZoneAdmin`) always re-check `zone_membership` fresh from D1 on
  every request — role is never cached in the token, so a promote/demote
  takes effect on the very next request.

## The one thing worth being careful about

`scores.score_key` is a real, indexed `UNIQUE` column computed as
`'team-'||team_id||'-h'||holenumber` or `'player-'||player_id||'-h'||holenumber`
(see `scoreKey()` in `worker/db.ts`), reproducing the old Azure Table
Storage RowKey scheme on purpose. A naive `UNIQUE(event_id, team_id,
player_id, holenumber)` constraint would **not** correctly dedupe
team-scored rows, because SQLite treats every `NULL player_id` as distinct
from every other `NULL` under a multi-column UNIQUE — you'd get silent
duplicate rows instead of the intended upsert. Score writes go through
`INSERT ... ON CONFLICT(score_key) DO UPDATE ...`; don't "simplify" this back
to the multi-column constraint without re-deriving why it was wrong.

## Local dev

Plain `npm run worker:dev` (`wrangler dev`, local D1) is fine here — unlike
cornhole, golf's D1 has no shared-data dependency forcing `--remote`.
`.dev.vars` needs `AUTH_SECRET` (any value locally, doesn't need to match
production) and `GOLF_COURSE_API_KEY` (real key, or course search/lookup
just no-ops with a 501).

## Not built yet

Cornhole has a "sync champion into SOLDelco" feature (link a tournament to a
SOLDelco event, push the winning team into SOLDelco's `competitions` /
`teams` tables). **Golf has no equivalent.** If asked to build this, the
cornhole implementation (`c:\Dev\cornhole\worker\index.ts`, the
`/api/events/:id/link` and `/api/events/:id/sync` routes) is the pattern to
follow — but note SOLDelco's `competitions.kind` describes scoring *shape*
(`score` | `placement` | `rsvp_only`), not a game name, so a synced golf
result would insert `kind = 'score'`.

## Confirmed dead code, already removed during the migration

`api/src/functions/debugAuth.ts` (self-labeled temporary, zero frontend
callers), `src/utils/tiebreakers.ts` (empty placeholder, zero importers),
and the `zod`/`react-qr-code` npm dependencies (zero usages in `src` despite
being listed, and despite the stale README claiming a QR-share-code
feature) were all confirmed dead via grep before deletion — don't
resurrect them without a fresh check.

## Bootstrap data

The initial `SOL` zone and its 17 players were seeded from
`players-export.csv` (gitignored, lives in `c:\Dev\SOLDelco`) via a one-time
SQL script, itself gitignored (`scripts/seed_sol_zone.sql`, contains real
emails/phone numbers). Each player's initial claim secret is their lowercased
last name. Tom (`playerid 1`) is the zone's sole admin.

## Stale docs

`README.md` still describes the original Supabase-era architecture (Events
CRUD, Supabase Auth, `.env` setup) — none of it reflects the current
Cloudflare/D1/Hono reality. It wasn't rewritten as part of this migration;
treat anything in it as unreliable until someone does.

## Frontend behaviors already handled — don't rebuild these

- `src/root/App.tsx` has a real iOS Safari `--app-height` viewport
  workaround (visualViewport-driven, not just `100dvh`) for the toolbar
  collapse/expand bug.
- `src/pages/ScoringPage.tsx` already has sunlight/mobile-first design built
  in: 64px thumb-sized +/-/confirm buttons, filled high-contrast score pills
  (not just colored text), haptic feedback, and real optimistic/batched-save
  behavior (individual-mode scores batch in memory and flush on
  hole/team navigation; team-mode saves immediately). Confirmed by direct
  read, not assumed — see the code comments in that file for why.
