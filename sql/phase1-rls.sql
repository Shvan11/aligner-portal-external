-- =============================================================================
-- Aligner Portal — Phase 1 RLS (run in the single Supabase mirror's SQL editor)
-- =============================================================================
--
-- The Supabase project is a RAW 1:1 mirror of the clinic's local Postgres (the
-- `failover` CDC sink). It holds the ENTIRE clinic DB, so the portal must NOT be
-- able to read arbitrary tables with the anon key. This script:
--
--   1. Enables RLS + read-only (SELECT) policies on exactly the six tables the
--      portal reads, each scoped to the doctor identified by the `dr_id` claim
--      in the Supabase JWT minted by the main app
--      (POST /api/aligner-portal/token).
--   2. Grants SELECT on those tables to the `authenticated` role (the role our
--      minted JWT carries). The anon role gets nothing here.
--
-- Run AFTER the failover sink has populated these tables. Safe to re-run
-- (policies are dropped + recreated; GRANTs are idempotent).
--
-- Notes / invariants:
--   * The failover sink connects as the table OWNER over the session pooler and
--     therefore BYPASSES RLS — enabling RLS here does NOT break the mirror. Do
--     NOT run `ALTER TABLE ... FORCE ROW LEVEL SECURITY` (that would block the
--     owner too) and do NOT add FK constraints (the sink upserts coalesced
--     changes without guaranteeing parent-before-child order).
--   * The claim is read with `auth.jwt() ->> 'dr_id'` and cast to int. Our JWT
--     also sets `role = 'authenticated'`, so PostgREST runs queries as that role.
--   * Admins do NOT get a blanket bypass here — admin impersonation works by the
--     main app minting a token scoped to the impersonated doctor's dr_id, so the
--     same per-row policy applies. The admin's "list all doctors" need is served
--     by the main app (GET /api/aligner-portal/doctors), not the mirror.
-- =============================================================================

begin;

-- Helper: the caller's dr_id as int (NULL when the claim is absent → no rows).
-- Inlined per-table below rather than a function, to keep this self-contained.

-- ---- aligner_doctors : a doctor sees only their own row ----------------------
alter table public.aligner_doctors enable row level security;
drop policy if exists portal_select on public.aligner_doctors;
create policy portal_select on public.aligner_doctors
  for select
  to authenticated
  using ( dr_id = (auth.jwt() ->> 'dr_id')::int );

-- ---- aligner_sets : sets owned by the caller --------------------------------
alter table public.aligner_sets enable row level security;
drop policy if exists portal_select on public.aligner_sets;
create policy portal_select on public.aligner_sets
  for select
  to authenticated
  using ( aligner_dr_id = (auth.jwt() ->> 'dr_id')::int );

-- ---- aligner_batches : batches of the caller's sets -------------------------
alter table public.aligner_batches enable row level security;
drop policy if exists portal_select on public.aligner_batches;
create policy portal_select on public.aligner_batches
  for select
  to authenticated
  using (
    aligner_set_id in (
      select s.aligner_set_id
      from public.aligner_sets s
      where s.aligner_dr_id = (auth.jwt() ->> 'dr_id')::int
    )
  );

-- ---- aligner_notes : notes of the caller's sets -----------------------------
alter table public.aligner_notes enable row level security;
drop policy if exists portal_select on public.aligner_notes;
create policy portal_select on public.aligner_notes
  for select
  to authenticated
  using (
    aligner_set_id in (
      select s.aligner_set_id
      from public.aligner_sets s
      where s.aligner_dr_id = (auth.jwt() ->> 'dr_id')::int
    )
  );

-- ---- works : work records that carry one of the caller's sets ---------------
alter table public.works enable row level security;
drop policy if exists portal_select on public.works;
create policy portal_select on public.works
  for select
  to authenticated
  using (
    work_id in (
      select s.work_id
      from public.aligner_sets s
      where s.aligner_dr_id = (auth.jwt() ->> 'dr_id')::int
    )
  );

-- ---- patients : patients behind one of the caller's works -------------------
alter table public.patients enable row level security;
drop policy if exists portal_select on public.patients;
create policy portal_select on public.patients
  for select
  to authenticated
  using (
    person_id in (
      select w.person_id
      from public.works w
      join public.aligner_sets s on s.work_id = w.work_id
      where s.aligner_dr_id = (auth.jwt() ->> 'dr_id')::int
    )
  );

-- ---- Grants : only the six read tables, only to `authenticated` -------------
-- (RLS still filters rows; the GRANT just makes the table reachable via the API.)
grant select on public.aligner_doctors to authenticated;
grant select on public.aligner_sets    to authenticated;
grant select on public.aligner_batches to authenticated;
grant select on public.aligner_notes   to authenticated;
grant select on public.works           to authenticated;
grant select on public.patients        to authenticated;

commit;

-- =============================================================================
-- Verification (run as needed in the SQL editor):
--
--   -- Confirm RLS is on for the six tables:
--   select relname, relrowsecurity
--   from pg_class
--   where relname in ('aligner_doctors','aligner_sets','aligner_batches',
--                     'aligner_notes','works','patients');
--
--   -- Simulate a doctor's view (replace 123 with a real dr_id):
--   set local role authenticated;
--   set local request.jwt.claims = '{"role":"authenticated","dr_id":123}';
--   select count(*) from public.aligner_sets;   -- only that doctor's sets
--   reset role;
--
-- Reminder: every OTHER mirror table must remain WITHOUT a SELECT grant to
-- anon/authenticated so it stays out of the PostgREST API.
-- =============================================================================
