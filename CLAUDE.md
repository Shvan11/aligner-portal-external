# CLAUDE.md

## Project Overview

**Shwan Aligner Portal External** - External-facing portal for orthodontists to manage aligner cases, hosted on Cloudflare Pages with Supabase backend.

### Purpose
This is a **client-facing portal** that allows partner doctors to:
- View and manage their aligner cases
- Track aligner sets, batches, and delivery status
- Add notes and communicate with the lab
- Adjust days-per-aligner on a batch
- Upload/view/delete case photos on a set (Phase 3 — private Cloudflare R2 bucket)
- See clinic announcements (staff-composed + auto batch-manufactured/delivered events) and
  dismiss them (Phase 3b — read receipts reverse-sync to the clinic)
- View treatment progress (aligners delivered vs. total)
- Access PDF files and YouTube videos for sets

Every portal write (note, days change, photo/scan upload) also drops a best-effort
`aligner_activity_flags` row (`source='portal'`) that feeds the STAFF app's "Portal activity"
header bell after reverse sync.

(Payment status is parked, not built — see Supabase Integration below.)

### Tech Stack
- **Frontend**: React 19.2, TypeScript 5.9, Vite 7.2
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Hosting**: Cloudflare Pages
- **Authentication**: Cloudflare Access (JWT)
- **Styling**: Plain CSS with CSS Variables

### Application Scale
| Metric | Count |
|--------|-------|
| React Components (TSX) | 18 |
| Pages | 2 |
| Custom Hooks | 4 |
| Contexts | 1 |
| Type Definition Files | 4 |
| CSS Files | 2 |

---

## Commands

```bash
# Development
npm run dev              # Vite dev server (5173)

# Production
npm run build            # TypeScript check + Vite build to /dist
npm run preview          # Preview production build

# Type Checking
npm run typecheck        # Check types
npm run typecheck:watch  # Watch mode
```

---

## Architecture

### Project Structure
```
/src/
  main.tsx               # Entry point
  App.tsx                # Router with 3 routes
  styles.css             # Global styles with CSS variables

  /pages/                # 2 page components
    Dashboard.tsx        # Case list with stats and search
    CaseDetail.tsx       # Case detail with sets, batches, notes

  /components/shared/    # 13 shared components
    PortalHeader.tsx     # Header with branding and logout
    AnnouncementBanner.tsx # System announcements
    AdminDoctorSelector.tsx # Admin doctor impersonation
    CaseCard.tsx         # Dashboard case card
    SetCard.tsx          # Set card with expandable details
    BatchesSection.tsx   # Batch list with days editor
    NotesSection.tsx     # Notes timeline with add note form
    PhotosSection.tsx    # Case-photo panel (upload + grid + viewer state)
    SetPhotoUpload.tsx   # Photo upload button with byte-level progress
    SetPhotoGrid.tsx     # Photo thumbnail grid with delete
    FullscreenImageViewer.tsx # Fullscreen photo overlay (Esc/click to close)
    YouTubeVideoDisplay.tsx # YouTube video embed
    ErrorBoundary.tsx    # Render-crash catch-all fallback

  /hooks/                # 4 custom hooks
    useAuthenticatedDoctor.ts # Auth + admin impersonation
    useBatches.ts        # Batch data management
    useNotes.ts          # Notes data management
    usePhotos.ts         # Case-photo list/delete per set

  /contexts/             # 1 context
    ToastContext.tsx     # Toast notifications

  /lib/                  # 2 utility files
    supabase.ts          # Supabase client + auth helpers
    api.ts               # API utility functions

  /types/                # 4 type files
    index.ts             # Re-exports all types
    database.types.ts    # Database entity types
    api.types.ts         # API/state types
    components.types.ts  # Component prop types

  /styles/               # 1 additional CSS file
    YouTubeVideoDisplay.css
```

---

## TypeScript Configuration

### Strict Mode
Full strict mode enabled with additional checks:
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

### Path Aliases
```json
{
  "@/*": ["./*"],
  "@components/*": ["./components/*"],
  "@hooks/*": ["./hooks/*"],
  "@contexts/*": ["./contexts/*"],
  "@lib/*": ["./lib/*"],
  "@types/*": ["./types/*"]
}
```

### Compiler Options
```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "jsx": "react-jsx",
  "isolatedModules": true,
  "noEmit": true
}
```

---

## Routing

Simple 3-route structure using React Router v7:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Dashboard | List of all cases with stats |
| `/case/:workId` | CaseDetail | Individual case with sets, batches, notes |
| `*` | Redirect to `/` | Catch-all redirect |

---

## Authentication

### Cloudflare Access JWT → minted Supabase JWT (RLS)
The single Supabase project is a **raw 1:1 mirror of the clinic's local Postgres** (the `failover`
CDC sink), RLS-locked — the anon key alone returns nothing. Auth is a token exchange:
1. User authenticates via Cloudflare Access (`CF_Authorization` cookie = signed JWT with email).
2. The portal POSTs that JWT to the **`aligner-portal-auth` Edge Function**
   (`{VITE_SUPABASE_URL}/functions/v1/aligner-portal-auth/token`).
3. The Edge Function verifies it against Cloudflare's JWKS, maps the email to an aligner `dr_id`
   (service-role lookup), and mints a short-lived Supabase JWT carrying a `dr_id` claim
   (`role=authenticated`).
4. supabase-js attaches that token (via the `accessToken` option); **RLS on every raw table filters
   rows by the `dr_id` claim**. This is always-on — no clinic home-server / cloudflared dependency.

### Development/Testing
For testing, add `?email=doctor@email.com` to URL:
```
http://localhost:5173/?email=doctor@example.com
```

### Admin Mode
Admin email: `shwan.orthodontics@gmail.com`
- Can impersonate any doctor
- Doctor selection stored in sessionStorage

### Auth Flow
```typescript
// Priority order for doctor email:
1. URL parameter (?email=...)     // Development
2. Cloudflare Access JWT          // Production
3. sessionStorage fallback        // Navigation persistence
```

---

## Supabase Integration

The DB is the **raw clinic mirror** (snake_case). Reads avoid PostgREST embedding (no FK constraints
on the mirror) — related tables are fetched separately and joined in JS (`src/lib/api.ts`).

### Tables read (RLS, scoped by `dr_id`)
- `aligner_doctors`, `aligner_sets`, `aligner_batches`, `aligner_notes`, `works`, `patients`
- RLS + `SELECT` grants for these six: **`sql/phase1-rls.sql`**.
- Plus (Phase 3b): `doctor_announcements` (broadcast OR own `dr_id`) and
  `doctor_announcement_reads` (own receipts) — **`sql/phase3-announcements.sql`**.

### Writes (Phase 2 + 3b) → reverse-sync back to local
A doctor can do exactly four writes, all directly on the mirror; **reverse-sync CDC v2** carries them
to the clinic's local Postgres (whole-row LWW by `updated_at`):
- **Add note** → `INSERT aligner_notes` (RLS forces `note_type='Doctor'` **and `is_read=false`** —
  the column DEFAULTs to TRUE, so the insert must send it explicitly or the lab's unread badge never fires).
- **Change days** → `UPDATE aligner_batches.days`.
- Column-scoped grants + per-row RLS write policies for those two: **`sql/phase2-writes.sql`**.
- **Dismiss an announcement** → `INSERT doctor_announcement_reads` (own `dr_id`, only for an
  announcement the doctor can see; insert-only — upsert w/ `ignoreDuplicates`, no UPDATE grant).
  Receipts reverse-sync home to the staff app's per-announcement receipts UI.
- **Flag activity for the staff bell** → `INSERT aligner_activity_flags` after every note / days
  change / photo / scan upload (`tryCreateActivityFlag` in `src/lib/api.ts` — best-effort, one
  retry, never throws: the flag must never break the primary action). RLS pins `source='portal'`,
  `is_read=false` (the column default — NOT granted), the 4 activity types, and the doctor's own
  set. No SELECT grant — the portal writes flags blind; the STAFF app's "Portal activity" header
  bell reads them after reverse sync.
- Grants + policies for these two (and the announcements SELECTs): **`sql/phase3-announcements.sql`**.
- Prereq: the main app's `migrations/supabase/reverse-cdc.sql` `cdc_capture_remote()` is
  **SECURITY DEFINER** (so a non-owner writer's edit is recorded into `change_log` without granting
  it sync-infra privileges), and `REVERSE_SYNC_ENABLED=true` with the `reverse` sink enabled.

### Announcements (Phase 3b) — clinic → doctor banner
`doctor_announcements` is authored in the STAFF app (manual targeted/broadcast messages + auto
batch-manufactured/delivered events from `updateBatchStatus`) and **forward-syncs** onto the mirror
(the table deliberately has NO `updated_at`, keeping it out of reverse sync; its DDL lives in the
main app's `migrations/supabase/announcements-2026-07-11.sql`). `AnnouncementBanner` fetches the
doctor's unread announcements on load (two queries joined in JS — no realtime subscription, no
PostgREST embedding per portal convention) and filters expiry client-side; dismissing is the
receipts insert above, optimistic with rollback + toast on failure. NB a dismiss racing a staff-side
delete errors as **RLS 42501** (the visibility WITH CHECK fails before the FK) — treated as success
(both 42501 and 23503 are swallowed).

### Case photos (Phase 3) → private Cloudflare R2 bucket, portal-owned, NO sync involvement
Doctors attach clinical photos to a set. Photos never touch the mirror's public schema (no
metadata table, no DDL, nothing for the CDC sinks to see): they live only in the **private
R2 bucket `aligner-portal-files`** — the empty bucket left from the old pre-mirror pipeline,
reused (R2 chosen over Supabase Storage for the 10GB free tier + $0 egress). Keys are
`sets/{setId}/{ts}-{name}`; the object list is the source of truth (no metadata table). All
access goes through the **`aligner-portal-photos` Edge Function**
(`supabase/functions/aligner-portal-photos/index.ts`) — the only holder of R2 credentials;
the browser only ever sees short-lived presigned URLs. The function:
- verifies the same minted dr_id JWT the rest of the app reads under — sent in the dedicated
  **`x-portal-token` header** (Authorization carries the anon key for the gateway), verified
  against `PORTAL_JWT_SECRET`; dr_id is taken from the verified claims, never the body;
- checks `aligner_sets.aligner_dr_id = dr_id` (service-role read) before every operation
  (a delete re-derives its setId from the path);
- routes: `GET /photos?setId` (S3 ListObjectsV2 + 1h presigned GET view URLs),
  `POST /upload-url` (15-min presigned PUT — the browser uploads straight to R2, no 10MB
  body through the function; 10MB/image-MIME validated at grant time), `POST /delete`.

**One-time Cloudflare setup** (dashboard → R2, bucket `aligner-portal-files` already exists):
create a FRESH API token **`aligner-portal-writer`** (Object Read & Write, scoped to that
bucket) and put its keys in the main app's `.env` as `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY` (account id reuses `CLOUDFLARE_ACCOUNT_ID`); **revoke the old
`aligner-portal-edge-functions` token** (its keys are committed in git history —
`docs/R2_STORAGE_SETUP.md` in old commits — burned); apply `r2-cors.json` as the bucket's CORS
policy (presigned-PUT uploads are cross-origin XHR; replaces the old pipeline's stale origins).
Deploy: `scripts/deploy-photos-fn.ps1` (sets the `R2_*` function secrets, then deploys).
Smoke test: `node scripts/test-photos-fn.mjs` (mints JWTs from the main app's
`SUPABASE_JWT_SECRET`; full upload→list→view→delete round-trip + auth/ownership guards).

### Edge Functions
- `aligner-portal-auth` - verifies the Cloudflare-Access JWT and mints the dr_id-scoped Supabase JWT
  (`supabase/functions/aligner-portal-auth/index.ts`). Deploy with `verify_jwt = false`.
- `aligner-portal-photos` - case-photo pipeline over the private Storage bucket (see above).
  Deploy with `verify_jwt = false`.

### Parked (no raw equivalent — not built)
- Payments (`aligner_set_payments` was a derived view). Type defs remain in `src/types/` but are
  not wired up. (Announcements were un-parked in Phase 3b — see above.)

### Environment Variables
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Key Patterns

### Navigation - React Router ONLY
**NEVER use `window.location.href` for internal routes.**

```typescript
// CORRECT
import { useNavigate } from 'react-router-dom';
const navigate = useNavigate();
navigate('/case/123');

// WRONG - causes full page reload
window.location.href = '/case/123';
```

**Exception**: Cloudflare Access logout uses direct URL:
```typescript
window.location.href = '/cdn-cgi/access/logout';
```

### Toast Notifications
Use `ToastContext` for user feedback. **Never use `alert()`**.

```typescript
import { useToast } from '../contexts/ToastContext';
const toast = useToast();

toast.success('Saved!');
toast.error('Failed');
toast.warning('Check input');
toast.info('Processing...');
```

### Custom Hooks Pattern
Hooks manage data loading and caching:

```typescript
// Example: useBatches hook
const { batches, loadBatches } = useBatches();

// Load batches for a set
await loadBatches(setId);

// Access loaded data
const setBatches = batches[setId]; // AlignerBatch[]
```

### Type Import Conventions
```typescript
// Use type-only imports for types
import type { Patient, AlignerSet } from '../types';

// Regular imports for values
import { formatDate, formatPatientName } from '../lib/supabase';
```

---

## CSS Architecture

**"Clinical Editorial" design system** (full token set at the top of `src/styles.css`):

- **Type**: Bricolage Grotesque (`--font-display`, headings/stats/brand) + Schibsted Grotesk
  (`--font-body`), **self-hosted** via `@fontsource-variable/*` (imported in `main.tsx`, served
  same-origin from Cloudflare Pages — no render-blocking Google Fonts `<link>`). The variable
  packages register the family with a `Variable` suffix, so the stacks use
  `'Bricolage Grotesque Variable'` / `'Schibsted Grotesk Variable'`. Every stack carries
  Arabic-safe fallbacks (`'Segoe UI', Tahoma`) — patient names are often Arabic script.
- **Color**: the clinic teal family (`--portal-primary` #00897B) deepened with `--portal-ink`
  (teal-black text), `--portal-deep-1/2` (header/hero gradient band), `--portal-mint`
  (tinted surfaces). Status colors come in pairs (`--portal-success` + `--portal-success-tint`
  etc.) for the **tinted-badge** pattern (soft bg + strong text + status dot) — never solid
  white-on-color badges.
- **Elevation/shape**: teal-tinted layered shadows (`--portal-shadow-xs/-/hover/deep`), radius
  scale (`--radius-card/panel/btn/pill`). Cards = white + 1px `--portal-hairline` + shadow-xs.
- **Motion**: staggered `rise` reveals on load (use `animation-fill-mode: backwards`, NOT
  `both`/`forwards` — fill-forwards would pin `transform` and kill hover lifts), progress-bar
  sheen, pulsing status dots. **All motion collapses under `prefers-reduced-motion`.**
- **Signature elements**: monogram avatars (`.case-avatar`, `.patient-avatar` — script-agnostic
  first-char initials), chat-style notes (`.note-item` doctor right/teal vs `.note-item.lab-note`
  lab left/white), the deep-teal header band with dot lattice.
- Class names are the contract between `styles.css` and components — keep them stable. Dead
  feature CSS (announcements, payments) was removed; recover from git history if those features
  return. (Photo + fullscreen-viewer CSS was rebuilt in this design language for Phase 3.)

### Class Naming
Uses BEM-like naming with component prefixes:
- `.portal-*` - Layout components
- `.case-*` - Case card elements
- `.set-*` - Set detail elements
- `.batch-*` - Batch elements
- `.note-*` - Note elements
- `.photo-*` - Photo elements
- `.toast-*` - Toast notifications
- `.admin-*` - Admin components

### Responsive Design
Mobile breakpoint at 768px:
```css
@media (max-width: 768px) {
  /* Mobile styles */
}
```

---

## Component Reference

### Pages

| Component | Description |
|-----------|-------------|
| `Dashboard` | Main view with case list, stats, search |
| `CaseDetail` | Case details with expandable sets |

### Shared Components

| Component | Props | Description |
|-----------|-------|-------------|
| `PortalHeader` | doctor, isAdmin, impersonatedDoctor | Header with branding |
| `AnnouncementBanner` | doctorId | Unread clinic announcements banner (dismiss → read receipt) |
| `AdminDoctorSelector` | onDoctorSelect | Admin doctor picker |
| `CaseCard` | caseData, onSelect | Dashboard case card |
| `SetCard` | set, doctor, batches, notes, photos, etc. | Expandable set card |
| `BatchesSection` | batches, onUpdateDays | Batch list |
| `NotesSection` | notes, showAddNote, onAddNote | Notes timeline |
| `PhotosSection` | setId, photos, onRefresh, onDeletePhoto | Case-photo panel |
| `SetPhotoUpload` | setId, onUploadComplete | Upload button + progress |
| `SetPhotoGrid` | photos, onPhotoClick, onPhotoDelete | Thumbnail grid |
| `FullscreenImageViewer` | photo, onClose | Fullscreen photo overlay |
| `YouTubeVideoDisplay` | videoId | Video embed |
| `ErrorBoundary` | children | Render-crash catch-all fallback |

---

## Data Types

### Key Interfaces

```typescript
// Doctor
interface AlignerDoctor {
  dr_id: number;
  doctor_name: string;
  doctor_email: string | null;
}

// Set with relations
interface AlignerSet {
  aligner_set_id: number;
  work_id: number;
  set_sequence: number;
  upper_aligners_count: number;
  lower_aligners_count: number;
  is_active: boolean;
  set_url?: string;
  set_pdf_url?: string;
  set_video?: string;
  aligner_batches?: AlignerBatch[];
  aligner_set_payments?: AlignerSetPayment[];
}

// Batch
interface AlignerBatch {
  aligner_batch_id: number;
  batch_sequence: number;
  days?: number;
  delivered_to_patient_date?: string;
}

// Note
interface AlignerNote {
  note_id: number;
  note_type: 'Doctor' | 'Lab';
  note_text: string;
  created_at: string;
}

// Case data for dashboard
interface CaseData {
  work_id: number;
  patient: Patient | null;
  sets: AlignerSet[];
  total_sets: number;
  active_sets: number;
  active_set: AlignerSet | null;
}
```

---

## API Functions

All API functions are in `src/lib/api.ts`:

| Function | Description |
|----------|-------------|
| `fetchAlignerSetsWithDetails(drId)` | Dashboard: all sets for a doctor + work/patient/batches (JS-joined) |
| `fetchCaseDetail(workId, drId)` | Case page: work + patient + sets + batches |
| `fetchSetsForWork(workId, drId)` | Get sets for a specific case |
| `fetchBatches(setId)` | Get batches for a set |
| `fetchNotes(setId)` | Get notes for a set |
| `fetchWorkWithPatients(workIds)` | Combined work + patient data |
| `createNote(setId, text, type='Doctor')` | **Write** — add a doctor note (→ reverse-sync) |
| `updateBatchDays(batchId, days)` | **Write** — change days per aligner (→ reverse-sync) |
| `fetchPhotos(setId)` | Case photos + short-lived presigned view URLs (Edge Function → R2) |
| `uploadPhoto(setId, file, onProgress?)` | **Write** — presigned-URL upload to the private R2 bucket |
| `deletePhoto(path)` | **Write** — remove a photo (ownership re-checked server-side) |
| `fetchAnnouncements(drId)` | Unread, unexpired announcements (broadcast + targeted; reads joined in JS) |
| `dismissAnnouncement(id, drId)` | **Write** — insert a read receipt (→ reverse-sync; 42501/23503 = already gone, treated as success) |
| `tryCreateActivityFlag(setId, type, desc, relatedId?)` | **Write** — best-effort staff-bell flag (`source='portal'`); never throws |

---

## Development Notes

- **ES Modules** (`"type": "module"` in package.json)
- **Vite 7.2** handles TypeScript compilation
- **React Router v7** with BrowserRouter (not data router)
- **No console.log** - Errors silently handled or shown via toast
- **Font Awesome** self-hosted via `@fortawesome/fontawesome-free` (core + solid + brands only —
  no `far` usage), imported in `main.tsx` (not a CDN `<link>`)
- External URLs (Cloudflare Access logout) are the only exception to SPA navigation

---

## Deployment

### Cloudflare Pages
1. Build command: `npm run build`
2. Output directory: `dist`
3. Environment variables: Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Cloudflare Access
Configure Cloudflare Access to protect the portal:
1. Create Access Application for the domain
2. Configure authentication providers (email, SSO)
3. Set up Access policies for allowed users

**Allowed doctor emails are NOT hand-typed in the policy.** The policy's include
rule is "Emails in list" → a Zero Trust list (Zero Trust → My Team → Lists) that
the **main clinic app** keeps in sync with `aligner_doctors.doctor_email`
(`services/cloudflare/doctor-email-list.ts`; full replace on every doctor
create/update/delete + boot reconcile; `CLOUDFLARE_*` env vars in the main app's
`.env`). Adding/removing a doctor's email in Settings → Aligner Doctors grants/
revokes portal access automatically. The admin email stays as a separate
manually-typed include rule in the same policy — it isn't in `aligner_doctors`,
and it must survive even if the list sync misbehaves.

---

## Key Dependencies

```json
{
  "@supabase/supabase-js": "^2.76.0",
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^7.9.4",
  "typescript": "^5.9.3",
  "vite": "^7.2.2"
}
```
