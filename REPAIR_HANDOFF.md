# Aligner Portal — Repair Handoff

> Status: **this app is currently broken by design.** The backend it read from was retired during
> the Supabase consolidation. This guide explains what changed, the few hard constraints you must
> design around, and the decisions left to you. It is intentionally not prescriptive — pick the
> architecture that fits.

## What changed (why it's broken)

The clinic ran **two** Supabase projects: a *curated* snake_case projection the portal read
(`patients`, `work`, `aligner_sets`, `aligner_batches`, `aligner_notes`, `aligner_doctors`, …) and a
raw full-DB backup. These were collapsed into **one** Supabase database = a **raw 1:1 mirror** of the
clinic's local PostgreSQL. As part of that:

- The curated snake_case tables are **no longer produced** (the transform sink + reverse-sync path
  were deleted).
- The single DB now exposes the **raw schema**: original table names (`tblpatients`, `tblwork`,
  `tblAlignerSets`, `AlignerDoctors`, `tblAlignerNotes`, `tblAlignerBatches`) with **mixed-case
  columns** (`PersonID`, `AlignerSetID`, `Days`, `IsActive`, …).

Every query in `src/lib/api.ts` and `src/hooks/useAuthenticatedDoctor.ts` targets the old names, so
they all fail. Repointing env vars is **not** enough.

## The one constraint you can't design around

**The Supabase DB is a read-replica of the clinic's local Postgres, which is the source of truth.**

A forward sync continuously upserts local rows into the mirror. Therefore:

- **Reads** from the mirror are fine (and keep the portal working even if the clinic box is offline —
  that's the reason the portal uses Supabase at all).
- **Writes made directly to the mirror are unsafe**: the next forward sync overwrites them, and they
  never reach the source of truth. The app's write features (add note, edit batch `days`, mark read,
  photo metadata) therefore need a real path *back to local Postgres* — they cannot just `.update()`
  the mirror.

Two write paths exist to choose from:
1. **Reverse sync (Supabase → local).** The DB-level loop guard was deliberately preserved
   (`cdc_capture()` skips writes made under `SET LOCAL app.cdc_origin='reverse'`), so a reverse path
   can be reintroduced loop-free. The old reverse modules are in git history
   (`services/sync/sync-engine.ts`, `services/sync/reverse-sync-poller.ts`) as a reference.
2. **Call the main app's API.** The main app is reachable off-LAN via the cloudflared tunnel
   (`remote.shwan-orthodontics.com`). Writes could go browser → main-app API → local Postgres,
   which keeps a single write authority.

## What has no raw equivalent (decide what to do)

These tables existed only in the curated projection and are **not** in the raw mirror:

- `aligner_set_payments` — was a derived/aggregated view. Payment data in raw lives across invoice
  tables; you'll need to derive it (a DB view, or compute server-side) or drop the feature.
- `aligner_set_photos` + the R2/Edge-Function photo pipeline (`aligner-photo-*`) — portal-owned,
  never stored in local Postgres. Decide where photos live now (keep a portal-owned table/bucket the
  mirror never touches, or push into the main app's photo pipeline).
- `doctor_announcements` — was already a stub.
- `set_video` (on aligner sets) — confirm whether the raw schema carries it; it may have been
  portal-only.

## Reference: old curated → raw mapping

The retired projection is the exact translation table (snake_case ⇒ raw). Use it as your starting
reference; verify against `types/db.d.ts` (generated raw types) and
`services/database/queries/aligner-queries.ts` (how the main app reads the same data).

| curated table | raw table | column mapping (curated ⇒ raw) |
|---|---|---|
| `patients` | `tblpatients` | `person_id⇒PersonID`, `patient_name⇒PatientName`, `first_name⇒FirstName`, `last_name⇒LastName`, `phone⇒Phone` |
| `work` | `tblwork` | `work_id⇒workid`, `person_id⇒PersonID`, `type_of_work⇒Typeofwork`, `addition_date⇒AdditionDate` |
| `aligner_doctors` | `AlignerDoctors` | `dr_id⇒DrID`, `doctor_name⇒DoctorName`, `doctor_email⇒DoctorEmail`, `logo_path⇒LogoPath` |
| `aligner_sets` | `tblAlignerSets` | `aligner_set_id⇒AlignerSetID`, `work_id⇒WorkID`, `aligner_dr_id⇒AlignerDrID`, `set_sequence⇒SetSequence`, `type⇒Type`, `upper_aligners_count⇒UpperAlignersCount`, `lower_aligners_count⇒LowerAlignersCount`, `remaining_upper_aligners⇒RemainingUpperAligners`, `remaining_lower_aligners⇒RemainingLowerAligners`, `creation_date⇒CreationDate`, `days⇒Days`, `is_active⇒IsActive`, `notes⇒Notes`, `set_url⇒SetUrl`, `set_pdf_url⇒SetPdfUrl`, `set_cost⇒SetCost`, `currency⇒Currency` |
| `aligner_batches` | `tblAlignerBatches` | `aligner_batch_id⇒AlignerBatchID`, `aligner_set_id⇒AlignerSetID`, `batch_sequence⇒BatchSequence`, `upper_aligner_count⇒UpperAlignerCount`, `lower_aligner_count⇒LowerAlignerCount`, `manufacture_date⇒ManufactureDate`, `delivered_to_patient_date⇒DeliveredToPatientDate`, `days⇒Days`, `is_active⇒IsActive` |
| `aligner_notes` | `tblAlignerNotes` | `note_id⇒NoteID`, `aligner_set_id⇒AlignerSetID`, `note_type⇒NoteType`, `note_text⇒NoteText`, `created_at⇒CreatedAt`, `is_edited⇒IsEdited`, `edited_at⇒EditedAt`, `is_read⇒IsRead` |

> Tip: the lowest-effort way to keep most read queries unchanged is to recreate the curated
> snake_case tables as **read-only views** over the raw tables *inside the single DB*, scoped to
> aligner data. Whether you do that or rewrite the queries to hit raw tables directly is your call.

## Security (revisit — the DB now holds everything)

The mirror contains the **entire** clinic database, not just the aligner subset. The portal still
uses a **public anon key** in the browser. So the access boundary is now critical:

- Do **not** expose raw tables to the anon role. Expose only what the portal needs (curated views or
  a dedicated schema), and keep everything else out of the API.
- Decide how doctors are scoped to their own rows. Today auth is Cloudflare Access (email in a JWT
  cookie) with client-side filtering by `dr_id` — that is **not** a real row boundary. Options:
  integrate Supabase Auth so RLS can key off the doctor, sign a claim mapped to RLS, or route data
  access through the main app's authenticated API.

## Env / deployment

- Repoint `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Cloudflare Pages settings) at the
  surviving single project, and re-issue the anon key there.
- Recreate any Storage bucket + `aligner-photo-*` Edge Functions in that project if you keep the
  photo feature.

## Where to look (this repo, on the main app side)

- `types/db.d.ts` — generated raw schema types (authoritative table/column names).
- `services/database/queries/aligner-queries.ts` — how the main app reads aligner data from raw.
- `migrations/pg/*_add-failover-cdc.sql` — the `cdc_capture()` function incl. the preserved
  `app.cdc_origin='reverse'` loop guard (for a reverse-write path).
- Git history of `services/sync/cdc/portal-sink.ts`, `services/sync/sync-fetch.ts`,
  `services/sync/sync-engine.ts`, `services/sync/reverse-sync-poller.ts` — the exact old transform +
  reverse logic, if you want to mirror its filtering (aligner-only patients/work, Lab-only notes).

## Files that need work here

- `src/lib/supabase.ts` — client + auth.
- `src/lib/api.ts` — every read/write query.
- `src/hooks/useAuthenticatedDoctor.ts` — doctor lookup.
- `src/hooks/{useBatches,useNotes,usePhotos}.ts` and the photo components — depend on the above.
- `src/types/database.types.ts` — shapes for whatever schema you settle on.
