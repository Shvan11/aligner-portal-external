# CLAUDE.md

## Project Overview

**Shwan Aligner Portal External** - External-facing portal for orthodontists to manage aligner cases, hosted on Cloudflare Pages with Supabase backend.

### Purpose
This is a **client-facing portal** that allows partner doctors to:
- View and manage their aligner cases
- Track aligner sets, batches, and delivery status
- Add notes and communicate with the lab
- Upload and view photos for aligner sets
- Monitor payment status and view treatment progress
- Access PDF files and YouTube videos for sets

### Tech Stack
- **Frontend**: React 19.2, TypeScript 5.9, Vite 7.2
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Hosting**: Cloudflare Pages
- **Authentication**: Cloudflare Access (JWT)
- **Styling**: Plain CSS with CSS Variables

### Application Scale
| Metric | Count |
|--------|-------|
| React Components (TSX) | 13 |
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
    CaseDetail.tsx       # Case detail with sets, batches, notes, photos

  /components/shared/    # 11 shared components
    PortalHeader.tsx     # Header with branding and logout
    AnnouncementBanner.tsx # System announcements
    AdminDoctorSelector.tsx # Admin doctor impersonation
    CaseCard.tsx         # Dashboard case card
    SetCard.tsx          # Set card with expandable details
    BatchesSection.tsx   # Batch list with days editor
    NotesSection.tsx     # Notes timeline with add note form
    SetPhotoGrid.tsx     # Photo grid display
    SetPhotoUpload.tsx   # Photo upload handler
    FullscreenImageViewer.tsx # Lightbox for photos
    YouTubeVideoDisplay.tsx # YouTube video embed

  /hooks/                # 4 custom hooks
    useAuthenticatedDoctor.ts # Auth + admin impersonation
    useBatches.ts        # Batch data management
    useNotes.ts          # Notes data management
    usePhotos.ts         # Photos data management

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

### Writes (Phase 2) → reverse-sync back to local
A doctor can do exactly two writes, both directly on the mirror; **reverse-sync CDC v2** carries them
to the clinic's local Postgres (whole-row LWW by `updated_at`):
- **Add note** → `INSERT aligner_notes` (RLS forces `note_type='Doctor'` **and `is_read=false`** —
  the column DEFAULTs to TRUE, so the insert must send it explicitly or the lab's unread badge never fires).
- **Change days** → `UPDATE aligner_batches.days`.
- Column-scoped grants + per-row RLS write policies: **`sql/phase2-writes.sql`**.
- Prereq: the main app's `migrations/supabase/reverse-cdc.sql` `cdc_capture_remote()` is
  **SECURITY DEFINER** (so a non-owner writer's edit is recorded into `change_log` without granting
  it sync-infra privileges), and `REVERSE_SYNC_ENABLED=true` with the `reverse` sink enabled.

### Edge Functions
- `aligner-portal-auth` - verifies the Cloudflare-Access JWT and mints the dr_id-scoped Supabase JWT
  (`supabase/functions/aligner-portal-auth/index.ts`). Deploy with `verify_jwt = false`.

### Parked (no raw equivalent — not built)
- Payments (`aligner_set_payments` was a derived view), photos (`aligner_set_photos` + R2/Edge
  pipeline, portal-owned), announcements (`doctor_announcements`, stub → `AnnouncementBanner` renders
  nothing). Type defs for these remain in `src/types/` but are not wired up.

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
  (`--font-body`), loaded from Google Fonts in `index.html`. Every stack carries Arabic-safe
  fallbacks (`'Segoe UI', Tahoma`) — patient names are often Arabic script.
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
  feature CSS (announcements, photos, payments, fullscreen viewer) was removed; recover from git
  history if those features return.

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
| `AnnouncementBanner` | doctorId | System announcements |
| `AdminDoctorSelector` | onDoctorSelect | Admin doctor picker |
| `CaseCard` | caseData, onSelect | Dashboard case card |
| `SetCard` | set, doctor, batches, notes, photos, etc. | Expandable set card |
| `BatchesSection` | batches, onUpdateDays | Batch list |
| `NotesSection` | notes, showAddNote, onAddNote | Notes timeline |
| `SetPhotoGrid` | photos, onPhotoClick | Photo grid |
| `SetPhotoUpload` | setId, drId, onUploadComplete | Upload handler |
| `FullscreenImageViewer` | photo, onClose | Lightbox |
| `YouTubeVideoDisplay` | videoId | Video embed |

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

---

## Development Notes

- **ES Modules** (`"type": "module"` in package.json)
- **Vite 7.2** handles TypeScript compilation
- **React Router v7** with BrowserRouter (not data router)
- **No console.log** - Errors silently handled or shown via toast
- **Font Awesome** loaded from CDN in index.html
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
