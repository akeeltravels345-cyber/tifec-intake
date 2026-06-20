# TIFEC Electronic Intake Forms

Secure, HIPAA-conscious client intake for the TIFEC psychology practice.

- One shared base intake form **plus** per-clinician sections (configurable).
- A client picks (or is linked directly to) one of the 5 clinicians and submits.
- Answers are **encrypted (AES-256-GCM) before storage**.
- The clinician gets an email with a **secure link only** — no PHI in the email.
- Staff can view all submissions at `/admin`.

## ⚠️ HIPAA / compliance — read first

This app is built defensively (encryption at rest, no PHI in email), but **you
are responsible for making the full deployment HIPAA-compliant** before using it
with real clients:

1. **Sign BAAs** with every vendor that touches data: your hosting provider
   (Vercel offers a HIPAA plan with a BAA), your database (Neon offers a BAA),
   and your email provider (Microsoft 365 / Google Workspace can sign a BAA).
   Standard/free tiers usually are **not** covered.
2. **Replace the simple `/admin?key=` and token links with real staff logins**
   (e.g. NextAuth tied to your TIFEC accounts) before go-live.
3. Serve only over **HTTPS** (automatic on Vercel) and consider a data-retention
   / deletion policy for old submissions.

## The intake forms

Digitized faithfully from TIFEC's paper forms (`lib/forms.ts`):

- **Individual Client Intake** (`INDIVIDUAL_INTAKE`) — personal info, marital &
  mental-health history, general health, drug history, family mental-health
  history (select-all-that-apply), additional info, insurance + consent.
- **Couples Intake** (`COUPLES_INTAKE`) — a **single-person** form each partner
  fills out separately. The clinician clicks **"Start a couple"** on their
  dashboard to generate one link, sends it to both partners, and the two
  submissions are tied together by a shared `couple_id`. The dashboard tags them
  "👥 Couple" and each submission links to the other partner's form.
- **Informed Consent for Psychotherapy** (`INFORMED_CONSENT`) — the full consent
  text shown to the client with an electronic signature, appended to intake
  forms (controlled per form via `appendConsent`).
- **DSM-5-TR Level 1 Cross-Cutting Symptom Measure — Adult** (`DSM_LEVEL1_ADULT`)
  — the APA's 23-item self-rated screening measure (verbatim, 0–4 scale). A
  repeatable measure, so it carries **no** consent/insurance section. © APA;
  reproduced under their clinician-use terms and must not be modified.
  - **Auto-scoring** (`lib/dsm.ts`): the clinician's view shows a *Symptom screen
    summary* — the highest score per domain, flagging domains that reach APA's
    threshold for further inquiry (Mild 2+, or Slight 1+ for Suicidal Ideation,
    Psychosis, Substance Use). Endorsed suicidal ideation gets a prominent alert.
    A screening aid, not a diagnosis.

### Assigning forms to clinicians

Each clinician has a **`forms` list** in `lib/clinicians.ts` — one or more form
keys they offer. Their dashboard shows a separate shareable link per form, and
each submission records which form was used (so it always renders correctly).

```ts
// one form:
forms: ["individual"],
// a clinician who sees both individuals and couples:
forms: ["individual", "couples"],
```

When a clinician offers more than one form, the client either uses a direct
link (`/intake?clinician=<id>&form=<key>`) or picks the form on arrival. The
child/adolescent clinician also adds a guardian section via `extraSections`.

**To add a new form** (e.g. child intake, telehealth consent, release of info):
define it in `lib/forms.ts` as a new entry in `FORM_TEMPLATES`, then add its key
to the relevant clinicians' `forms` list. Nothing else needs to change.

### Conditional fields (show/hide logic)

Any field can declare a `showIf` rule so it only appears when relevant — e.g.
"How long have you been married?" shows only when Marital status = Married, and
the insurance details show only when the client says they'll use insurance.

```ts
{ name: "alcohol_freq", label: "How many times per week…", type: "text",
  showIf: { field: "alcohol", equals: "Yes" } }
```

Conditions support `equals`, `in: [...]`, `includes` (for multi-selects), and
`notEmpty`; an array of conditions means all must match. Hidden fields are not
required for submission, and their answers are **pruned** (never stored) if the
client fills one and then changes the trigger. The same check runs on the server.

## Customize for your practice

| What | File |
|------|------|
| Clinician names, emails, template, per-clinician questions | `lib/clinicians.ts` |
| The intake form questions (individual / couples / consent) | `lib/forms.ts` |
| Branding / colors | `app/globals.css`, `app/layout.tsx` |

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
```

With no `DATABASE_URL` set, submissions are stored in an encrypted local file
(`data/submissions.local.json`) and notification emails are logged to the
console instead of sent — so you can test the whole flow with zero setup.
`.env.local` was created for you with a dev encryption key and
`ADMIN_PASSWORD=tifec-dev` (view submissions at `/admin?key=tifec-dev`).

## Production deploy (Vercel + Neon)

1. Create a Neon Postgres DB and run `db/schema.sql` against it.
2. In Vercel project settings, add the env vars from `.env.example`
   (`ENCRYPTION_KEY`, `DATABASE_URL`, `SMTP_*`, `APP_URL`, `ADMIN_PASSWORD`).
   - Generate the key once: `openssl rand -hex 32`. **Keep it safe** — losing it
     makes existing submissions unreadable.
3. Deploy. Share `https://your-app/intake?clinician=<id>` links with clients.

## Clinician accounts & dashboard

Each psychologist logs in and sees **only their own** intake forms, with status
tracking (New → Reviewed → Archived).

**Creating logins (admin):** open `/admin?key=<ADMIN_PASSWORD>`. You'll see all 5
clinicians; set an initial password for each and share it with them securely.
They sign in at `/login` and can change their own password at `/account`.

**Security model:**
- Passwords are hashed with scrypt (never stored in plaintext).
- Sessions are signed cookies (`SESSION_SECRET`), HTTP-only, 8-hour expiry.
- Viewing a submission requires login **and** that it belongs to your account —
  the emailed secure link now sends clinicians through login first.
- Status changes are ownership-guarded server-side (clinician B cannot touch
  clinician A's forms).

For production, consider replacing the shared-password `/admin?key=` with a
dedicated admin login. The admin page shows only counts — no client PHI.

## What clinicians can do

From the dashboard and a submission:

- **Search** their submissions by client name.
- **Status workflow** — New → Reviewed → Archived, with counts and filter tabs.
- **Client snapshot** — name, DOB, age, phone, email pinned at the top of each submission.
- **Private notes** per submission — autosaved, encrypted at rest, never shown to the client. A ✎ marker on the dashboard flags submissions that have notes.
- **Print / Save as PDF** — a print-optimized layout for charts/records.
- **Delete** a submission (ownership-guarded, with confirm).
- **Autosave** — clients' in-progress answers are saved on their own device so they don't lose work on these long forms.

## Security & compliance features

- Passwords hashed with scrypt; signed HTTP-only session cookies (8h).
- **Ownership guards** on every PHI path (view / status / notes / delete) — a clinician can only touch their own submissions.
- **Login rate limiting** — 8 attempts per email per 15 min, then a temporary lockout.
- **Access audit log** — every view / status change / note / delete is recorded (clinician, submission, action, timestamp) with no PHI, in the `access_log` table (or `data/access_log.local.json` in dev). Supports HIPAA access-tracking expectations.
- Notes and answers both AES-256-GCM encrypted at rest.

## Routes

- `/` — landing + per-clinician links + clinician sign-in
- `/intake` — the form (clinician picker, or `?clinician=<id>`); autosaves drafts
- `/login`, `/account` — clinician sign-in and change-password
- `/dashboard` — clinician's own submissions: search, counts, status filters, share link
- `/submissions/<token>` — secure view (login + ownership): snapshot, notes, status, print, delete
- `/admin?key=<ADMIN_PASSWORD>` — manage clinician logins (no PHI)
- `/api/submit`, `/api/auth/*`, `/api/submissions/{status,notes,delete}`, `/api/admin/set-password`, `/api/account/password`
