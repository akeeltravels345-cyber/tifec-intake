# Mobile Scheduling App — Design Handoff

A purpose-built, phone-native scheduling app for TIFEC clinicians, living at the
**`/m`** route inside the main scheduling/billing codebase. It is **not** the web
app shrunk down — it is its own interface (its own navigation, headers, and
components), sharing the same backend and data as the web app.

- **Live:** `https://schedule.caymanessentialcare.com/m` and `https://portal.caymanessentialcare.com/m`
- **Audience:** treating clinicians (and the admin) on their phones; installable to the Home Screen as a standalone PWA named "Schedule".
- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript. Plain CSS (no Tailwind, no component library). Icons are hand-written inline SVG.

> This document is the map. The actual design lives in the component files and in
> one CSS section (see **Where the design lives**). A designer/developer can take
> the files listed in **Files to hand off** and have the whole app.

---

## 1. Run it locally (to see and edit the design)

```bash
npm install
npm run dev        # serves on http://localhost:3009 by default in this project
```

Then open **http://localhost:3009/m** and switch the browser to a phone viewport
(375×812 is what we design against). Sign-in is required; in local dev the app
accepts a `dev_as=<clinician-id>` cookie (e.g. `shion-oconnor`) to impersonate a
clinician without a password.

With no database configured, the app runs off local JSON files in `data/*.local.json`,
so it works fully offline for design work.

---

## 2. What the app is (shell & conventions)

- **Full-bleed shell.** There is no global top bar. Each screen renders *its own*
  header — usually a deep-navy band with the date/title, actions, and (on Today)
  a week strip. The web app's sidebar, brand bar, and footer are hidden here.
- **Bottom tab bar** (`MobileNav`): two tabs — **Today** (`/m`) and **Calendar**
  (`/m/calendar`). Everything else is reached from within screens (the avatar
  menu, the bell, the + button).
- **Bottom sheets** for menus and confirmations (account menu, add menu, cancel
  confirm) — they slide up from the bottom with a grab handle.
- **One accent language** throughout: deep navy headers, teal primary, indigo for
  group/secondary, warm red/amber for attention. See **Design system**.
- **Cayman time (UTC−5, no DST)** is the clinic's time. All user-facing times are
  shown in Cayman time; the code converts from stored UTC. Do not "fix" this to
  the viewer's local time.
- **House rules:** no em/en dashes in copy (use commas, colons, or "to"); icons
  are inline SVG only (no emoji, no icon font); keep everything working at ~375px
  wide with a comfortable touch target (~44px) on actions.

---

## 3. Screen map

Each route is a server page (data loading + auth gate) that renders a client
component (the UI). Edit the **component** for look/interaction; edit the **page**
for what data is loaded.

| Screen | Route | Page file | UI component |
|---|---|---|---|
| **Today** (agenda) | `/m` | `app/m/page.tsx` | `components/scheduling/MobileAgenda.tsx` |
| **Calendar** (week/month) | `/m/calendar` | `app/m/calendar/page.tsx` | `components/scheduling/MobileCalendar.tsx` |
| **Appointment detail** | `/m/appt/[id]` | `app/m/appt/[id]/page.tsx` | `components/scheduling/MobileApptDetail.tsx` |
| **Edit appointment** | `/m/appt/[id]/edit` | `app/m/appt/[id]/edit/page.tsx` | `components/scheduling/MobileApptEdit.tsx` |
| **Book an appointment** | `/m/book` | `app/m/book/page.tsx` | `components/scheduling/MobileBook.tsx` |
| **Block off time** | `/m/block` | `app/m/block/page.tsx` | `components/scheduling/MobileBlock.tsx` |
| **Notifications** (inbox + settings) | `/m/notifications` | `app/m/notifications/page.tsx` | `components/scheduling/MobileNotifications.tsx` |
| **Hours & availability** | `/m/hours` | `app/m/hours/page.tsx` | (web availability editor, reused) |
| **App shell / layout** | — | `app/m/layout.tsx` | `components/scheduling/MobileNav.tsx` |

Shared sub-component: `components/scheduling/MobileWhoPicker.tsx` — the "whose
schedule" pill + sheet used on Today and Calendar to view a colleague's day.

---

## 4. Component inventory

| File | What it is / notable UI |
|---|---|
| `MobileAgenda.tsx` | **Today.** Navy header with day name/date, a 🔔 bell (unread badge) and avatar; a swipeable 7-day week strip; an **Acuity-style day grid** (hours down the side, appointment blocks placed by time, lane-packed for overlaps, a red "now" line, grey hatched "blocked" bands). A **+ FAB** opens an add sheet (Book / Block). The avatar opens an account sheet (booking link, hours, sign out). |
| `MobileCalendar.tsx` | **Calendar.** Week ⇄ Month toggle; week lists 7 days of cards, month is a dot-grid. Same "whose schedule" picker. |
| `MobileApptDetail.tsx` | **Detail.** Navy header; status chips; rows (mode, payment, email, booked-by); actions: join video, log session, send intake, **Edit**, cancel & ask to rebook (confirm sheet). |
| `MobileApptEdit.tsx` | **Edit form.** Client, service (grouped by category), mode segmented control, date/time, notes, notify toggle. |
| `MobileBook.tsx` | **Booking wizard.** Numbered stepper; service step is a **category accordion** (tap a category to expand its services); then a When step with summary + notify. |
| `MobileBlock.tsx` | **Block off time.** Label; "block whole day(s)" toggle (date range) or a timed block (30/60/90/120 min segmented). |
| `MobileNotifications.tsx` | **Notifications.** Two settings toggles (device push on/off, reminders on/off) + an inbox list, color-coded by type (booking/reschedule/cancel/reminder), with relative timestamps and unread dots. |
| `MobileNav.tsx` | Bottom tab bar (Today / Calendar). |
| `MobileWhoPicker.tsx` | Pill + bottom sheet to switch whose schedule you're viewing. |

PWA plumbing (not visual, but part of the app): `components/PwaRegister.tsx`
(registers the service worker), `components/InstallPrompt.tsx` (add-to-home-screen
nudge), `public/sw.js` (service worker: offline caching + push display),
`public/schedule.webmanifest` (the installable "Schedule" app manifest + icons).

---

## 5. Design system

> Most mobile styles use **hardcoded hex values** (not CSS variables). The palette
> below is the source of truth. The web app's `:root` variables (`--ink`,
> `--brand`, `--teal`, …) exist but the mobile screens mostly set colors inline.

### Palette

| Role | Hex | Used for |
|---|---|---|
| Deep navy | `#1E2A44` | Screen header bands, dark top areas |
| Primary teal | `#2F8E93` (pressed `#256E72`) | Avatar, active day, primary accents/buttons |
| Teal-green | `#1f7a6f` / `#0F6E56` | Appointment accent bar, success text |
| Booking tint | `#e4f3ee` / `#E1F5EE` | "My schedule" pill, booking icon wash |
| Indigo | `#2E3192` | Group sessions, reschedule accent, nav active |
| Warm red/orange | `#D85A30` | Free-consult accent, **unread badge** |
| Alert red | `#d8453a` | The "now" time line on the day grid |
| Ink (text) | `#232a3d` | Primary text |
| Muted text | `#6B7679`, `#8a969a`, `#9aa4a7` | Secondary text, meta |
| Muted on navy | `#9FB2C9` | Sublabels inside navy headers |
| Hairlines/borders | `#E7ECEE`, `#dde3e6`, `#eef1f2` | Card borders, dividers, grid lines |
| Surface | `#fff` on `#F4F6F7` ground | Cards on the page background |

**Notification type tints** (icon chip bg / icon color):
booking `#e4f3ee` / `#1f7a6f` · reschedule `#e9eaf6` / `#2E3192` · cancel `#fbe9e4` / `#c0472a` · reminder `#fdf1dc` / `#a9791c`.

### Typography
- **Body:** `"Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`.
- **Display serif:** `"Newsreader"` (used for the public booking page's big titles).
- Sizes range roughly 10.5px (meta) → 22px (screen date). Weights 400/600/700/800.
- Numerals in the day grid and dates should stay legible at small sizes.

### Shape, spacing, motion
- **Radius:** cards ~12–14px, pills/FAB fully rounded, small chips ~7–10px.
- **Spacing:** 14–16px screen gutters; 8–12px gaps between cards.
- **Elevation:** very light (`0 1px 2px rgba(30,42,68,.06)`), not heavy shadows.
- **Switches** are iOS-style (teal when on). **Segmented controls** for mode/length.
- Motion is minimal; respect `prefers-reduced-motion`.

### Icons
All inline SVG, stroke-based (`stroke-width` ~1.9, round caps/joins), currentColor.
No icon library. New icons should match that weight and style.

---

## 6. Where the design lives (CSS)

All mobile styles are in **`app/globals.css`**, in one contiguous block at the end
(roughly **lines 5260–5647**). They are organized by screen with section banners
and share class **namespaces** — handy for finding things:

| Prefix | Area |
|---|---|
| `.mapp*` | App shell / layout wrapper |
| `.mag*` | Today agenda (header, week strip, FAB, account sheet, bell) |
| `.mgrid*` | The Acuity-style day grid (rows, lines, appt blocks, blocks, "now" line) |
| `.madet*` | Appointment detail |
| `.mbk*` | Book wizard + shared form shell (also used by Block/Edit) |
| `.medit*` | Edit form controls (select, segmented, textarea) |
| `.mcal*` | Calendar (week/month) |
| `.mwho*` | "Whose schedule" picker |
| `.mnav*` | Bottom tab bar |
| `.mnot*` | Notifications (settings toggles + inbox) |
| `.mme*` | Account/menu rows (used in the Today account sheet) |

---

## 7. Backend / data wiring — please don't break this

The whole point of the app is that it uses the **same APIs and data as the web
app** — billing, email confirmations, intake forms, notifications all flow through
the same endpoints. A redesign should keep these calls intact:

- **Create / update / cancel:** `POST /api/scheduling/appointments` (`action: create | update | cancelRebook | delete`).
- **Send intake manually:** `POST /api/scheduling/intake-send`.
- **Log a session for billing:** link to `/billing/sessions/new?fromAppt=<id>`.
- **Notifications:** `GET/POST /api/scheduling/notifications` (inbox); device push via `/api/push/*`; prefs via `/api/scheduling/prefs`.
- **Public booking** (what a client uses): `/book?clinician=<id>` → `POST /api/book/create`.

Data/time helpers worth knowing: `lib/caymanTime.ts` (Cayman conversions),
`lib/scheduling.ts` (appointments/types), `lib/notifications.ts`,
`lib/clinicianPrefs.ts`.

---

## 8. Known UX patterns to preserve (or deliberately redesign)
- Day name + date as the header identity on Today; week strip with a dot on days that have appointments; teal ring on today.
- The day grid is meant to feel familiar to clinicians moving from Acuity.
- Bell shows an unread count badge; opening the inbox marks everything read.
- The + button is an action menu (Book / Block), not a single link.
- Bottom sheets for menus/confirmations rather than full pages where possible.

---

## 9. Files to hand off (the complete app)

Screens & shell:
```
app/m/layout.tsx
app/m/page.tsx
app/m/calendar/page.tsx
app/m/appt/[id]/page.tsx
app/m/appt/[id]/edit/page.tsx
app/m/book/page.tsx
app/m/block/page.tsx
app/m/notifications/page.tsx
app/m/hours/page.tsx
```

Components:
```
components/scheduling/MobileAgenda.tsx
components/scheduling/MobileCalendar.tsx
components/scheduling/MobileApptDetail.tsx
components/scheduling/MobileApptEdit.tsx
components/scheduling/MobileBook.tsx
components/scheduling/MobileBlock.tsx
components/scheduling/MobileNotifications.tsx
components/scheduling/MobileNav.tsx
components/scheduling/MobileWhoPicker.tsx
```

Styles & PWA:
```
app/globals.css            (mobile section ~lines 5260–5647)
components/PwaRegister.tsx
components/InstallPrompt.tsx
public/sw.js
public/schedule.webmanifest
public/manifest.webmanifest
```

> If the designer only has the files above (plus `package.json` / config to run
> Next.js), they have the entire front end of the mobile app. Everything else in
> the repo is backend/data they can call but needn't restyle.

---

## 10. Good first tasks for whoever picks this up
- Pull the hardcoded mobile colors into CSS variables (a real token layer) so the
  palette can be themed in one place.
- Audit touch targets and spacing at 360–430px widths.
- Add a dark-mode pass (the app is currently light-only on `/m`).
- Polish empty states and loading states per screen.

Questions about intent or data flow: start from this doc, then the component file
for the screen in question.
