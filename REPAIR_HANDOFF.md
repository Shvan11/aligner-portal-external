# Aligner Portal — Repair Handoff

> Status: **RESOLVED.** The portal was broken when the clinic collapsed its two Supabase
> projects into one raw 1:1 mirror of local Postgres. It now reads that raw (snake_case) mirror
> under RLS and writes back through reverse-sync CDC. This file records the final architecture and
> the deploy steps; the living reference is `CLAUDE.md`.

## What broke, and the fix

The curated snake_case projection the portal used to read was retired; the single surviving
Supabase DB is a **raw 1:1 mirror of the clinic's local Postgres** (the `failover` CDC sink). Two
things were rebuilt:

1. **Reads** (`src/lib/api.ts`) now target the raw mirror's snake_case tables (`aligner_sets`,
   `aligner_batches`, `aligner_notes`, `works`, `patients`, `aligner_doctors`) under **RLS**, scoped
   to the doctor by a short-lived JWT that the `aligner-portal-auth` Edge Function mints from the
   Cloudflare-Access identity (`src/lib/supabase.ts`). No clinic home-server dependency on the read
   path. PostgREST resource-embedding is avoided (the mirror has no FK constraints) — related tables
   are fetched separately and joined in JS.

2. **Writes** (the two doctor actions) go **directly to the mirror** and are carried back to local
   Postgres by **reverse-sync CDC v2** (Supabase → local, whole-row last-write-wins by `updated_at`):
   - **Add note** → `INSERT` into `aligner_notes` as a `'Doctor'` note with an **explicit
     `is_read=false`** (the column DEFAULTs to TRUE, so omitting it would suppress the lab's unread
     badge; the RLS policy forces false).
   - **Change days** → `UPDATE aligner_batches.days`.

   Both tables carry `updated_at`, so they are in the reverse-sync set. The old "the next forward
   sync overwrites mirror writes" hazard is gone: forward sync only pushes local→mirror when
   `local.updated_at >= mirror.updated_at`, so a fresher portal edit survives until reverse sync
   applies it home. Inserted notes get an **EVEN** `note_id` from the mirror's odd/even-split identity
   sequence, so they never collide with local's ODD ids on apply.

## Deploy / enable runbook

> **All three DB steps were APPLIED to the live mirror and verified 2026-06-11** (RLS/grant matrix
> checked, write policies exercised as the `authenticated` role incl. negative tests, and a full
> committed note round-trip Supabase → reverse sync → local → delete → local confirmed). Kept for
> re-provisioning / disaster recovery:

1. **`sql/phase1-rls.sql`** — RLS + `SELECT` grants on the six read tables (already applied if the
   portal currently reads). Idempotent.
2. **Main app `migrations/supabase/reverse-cdc.sql` must be the SECURITY DEFINER build of
   `cdc_capture_remote()`.** The `authenticated` role has no write grant on `change_log`; the capture
   trigger records the reverse-feed entry on its behalf only because it runs as its owner. If an older
   build is live, re-apply §3 of that file — otherwise portal writes fail
   `permission denied for table change_log`.
3. **`sql/phase2-writes.sql`** — column-scoped `INSERT`/`UPDATE` grants + RLS write policies that let
   a doctor add a `'Doctor'` note and change `days` on **their own** rows, and nothing else.

Plus the standing requirements: `REVERSE_SYNC_ENABLED=true` on the clinic app and the `reverse` sink
enabled in Supabase `cdc_sink_control` (both live as of the reverse-sync v2 rollout).

Env (Cloudflare Pages): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`). The Edge
Function needs its own secrets (`PORTAL_JWT_SECRET`, `CF_ACCESS_*`, `PORTAL_ALLOWED_ORIGIN`, …) — see
`supabase/functions/aligner-portal-auth/index.ts`.

## Parked (no raw equivalent — intentionally not built)

- **Payments** (`aligner_set_payments` was a derived view) — paid/balance would need deriving from
  invoice tables. The misleading zero-value payment summary was removed from the dashboard card.
- **Photos** (`aligner_set_photos` + R2/Edge pipeline) — portal-owned, never in local Postgres.
- **Announcements** (`doctor_announcements`) — `AnnouncementBanner` renders nothing (stub).

## Security boundary (unchanged invariant)

The mirror holds the **entire** clinic DB. The portal must reach **only** the aligner subset: every
mirror table stays without an anon/`authenticated` grant except the six read tables and the two
write surfaces above, and RLS keys every row off the JWT's `dr_id` claim. Admin impersonation works
by minting a token scoped to the impersonated doctor — never a blanket bypass.
