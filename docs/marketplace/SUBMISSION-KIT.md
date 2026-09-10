# Marketplace submission kit (Zoom + Google)

Durable copy of everything used to publish the video integration, so nothing is lost.
Last updated 2026-09-10. No em dashes anywhere (house style).

## Key facts

- Live app domain: https://portal.caymanessentialcare.com (custom domain on the Vercel `tifec-intake` project; DNS CNAME `portal` -> `cname.vercel-dns.com` managed in Squarespace).
- Legal / docs pages (public, in-app): `/privacy`, `/terms`, `/docs/video`.
- Zoom app owner account: The Institute for Essential Care.
- Zoom Client IDs: development `mUayOOCcRnuk_rp76xJp7g`, production `aK3ftCCITcKKCES06EBIzw` (secrets are NOT stored here; they live only in Vercel env vars and the Zoom app).
- Zoom redirect (production): `https://portal.caymanessentialcare.com/api/scheduling/video/callback/zoom`
- Google redirect: `https://portal.caymanessentialcare.com/api/scheduling/video/callback/google`
- Zoom scopes: `meeting:write:meeting` (create), `meeting:delete:meeting` (cancel).
- Test reviewer login: `test-clinician@caymanessentialcare.com` (password set at `/admin`).

## Vercel env (production)

- `APP_URL` = `https://portal.caymanessentialcare.com`
- `ZOOM_CLIENT_ID` = `aK3ftCCITcKKCES06EBIzw`, `ZOOM_CLIENT_SECRET` = (production secret)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` = (Google OAuth client)
- Redeploy after any change so the values take effect.

---

## ZOOM listing text (paste-ready)

**Short description**
> Creates a Zoom meeting for each virtual appointment booked in Cayman Essential Care's scheduling system, on the clinician's own Zoom account.

**Long description**
> Cayman Essential Care's scheduling application lets our clinicians manage their appointments. When a clinician connects their own Zoom account, the app automatically creates a scheduled Zoom meeting for each of their virtual appointments and attaches the join link to that appointment. If an appointment is cancelled or deleted, the app cancels the corresponding Zoom meeting. The app requests only the ability to create and manage meetings on the connecting user's own account, and accesses nothing else.

**Application Overview (Technical Design)**
> Cayman Essential Care's scheduling application lets our clinicians manage their appointments. A clinician can connect their own Zoom account, and the app then creates a Zoom meeting automatically for each of their virtual appointments and attaches the join link to the appointment. If an appointment is cancelled or deleted, the app cancels the corresponding Zoom meeting. The integration uses the Zoom OAuth flow and the meeting create and delete APIs on the connecting clinician's own account only, and accesses no other Zoom data.

**Technology Stack (Technical Design)**
> The application is a Next.js (React) web app written in TypeScript, hosted on Vercel, with a Neon (PostgreSQL) database. Clinicians sign in with password-based sessions (scrypt-hashed; no plaintext passwords). It integrates with Zoom using the OAuth 2.0 authorization-code flow (User-managed app). Using each clinician's own access token, it calls the Zoom REST API: POST /users/me/meetings to create a scheduled meeting when a virtual appointment is booked, and DELETE /meetings/{id} to remove that meeting if the appointment is cancelled. OAuth access and refresh tokens are stored encrypted in the database and used only to create and cancel meetings for that clinician's own appointments. No Zoom SDK, webhooks, event subscriptions, or in-client features are used. Client health and billing information is encrypted at rest.

**Scope justification: meeting:write:meeting**
> The app creates a scheduled meeting on the connecting clinician's own Zoom account when a virtual appointment is booked, and deletes that meeting if the appointment is cancelled. This is the minimum scope required to create and remove those meetings. No other Zoom data is accessed.

**Scope justification: meeting:delete:meeting**
> When an appointment is cancelled or deleted in our scheduling system, the app deletes the corresponding Zoom meeting it previously created on the connecting clinician's own account, so no orphaned meetings are left behind. Only meetings created by this app are deleted, and no data is stored beyond the meeting reference needed to remove it.

**Release notes for the app reviewer**
> Cayman Essential Care's scheduling application lets clinicians manage appointments. This integration lets a clinician connect their own Zoom account so a Zoom meeting is created automatically for each of their virtual appointments, and cancelled if the appointment is cancelled.
>
> How to test:
> 1. Open https://portal.caymanessentialcare.com/login and sign in with the test account provided below.
> 2. In the left menu click Schedule, then click Video in the toolbar.
> 3. Click Connect Zoom and approve the authorization with your Zoom account. You return to a page showing "Zoom: Connected."
> 4. Click Schedule, then + New. Enter a client name, set Mode to Virtual, pick a time, and Save.
> 5. Open that appointment. A Zoom join link has been created automatically on the connected account.
> 6. Open the appointment and click Delete. The corresponding Zoom meeting is removed from the account.
>
> The app requests only meeting:write:meeting and meeting:delete:meeting, used solely to create and cancel meetings on the connecting user's own account. No other Zoom data is accessed. Tokens are stored encrypted and used only for this purpose.

## Zoom field values

- Marketplace Category: Health & Wellness. Industry Category: Healthcare.
- Support URL: `https://www.caymanessentialcare.com`
- Documentation URL: `https://portal.caymanessentialcare.com/docs/video`
- Privacy Policy URL: `https://portal.caymanessentialcare.com/privacy`
- Terms of Use URL: `https://portal.caymanessentialcare.com/terms`
- Configure URL (optional): `https://portal.caymanessentialcare.com/schedule/connections`
- Banner image: `docs/marketplace/zoom-banner-1824x176.png` (exactly 1824x176).
- App Gallery: `zoom-gallery-1-connections.png`, `zoom-gallery-2-calendar.png`.
- Architecture diagram: `TIFEC-Zoom-Architecture.pdf`.
- App management type: User-managed. Distribution: Public. Activation: activate immediately after approved.
- Strict Mode for redirect URLs: On. Subdomain Check: On.
- Security questions (Application Development): SSDLC No, SAST/DAST No, pen testing No.
- Security questions 2: TLS 1.2+ Yes; webhook x-zm-signature No (no webhooks used); stores Zoom user data / tokens Yes (encrypted at rest, used only to create/cancel the clinician's own meetings).
- Test account: login URL `https://portal.caymanessentialcare.com/login`, user `test-clinician@caymanessentialcare.com`, password set at /admin.
- Marketplace Developer Agreement: both boxes checked.

---

## GOOGLE verification kit

**Scope justification (.../auth/calendar.events)**
> Our application is the scheduling system for a mental-health practice. When a clinician connects their own Google account, the app creates a Google Calendar event with a Google Meet conference for each of their virtual appointments, and deletes that event if the appointment is cancelled. We use the calendar.events scope solely to create and remove these appointment events on the connecting user's primary calendar. We do not read other events or use the data for any other purpose. Our use complies with the Google API Services User Data Policy, including its Limited Use requirements.

**Demo-video script**
> 1. Show the homepage at https://portal.caymanessentialcare.com.
> 2. Sign in as a clinician; go to My Schedule, then Video, then Connect Google.
> 3. Show the Google consent screen (app name and the Google Calendar permission).
> 4. Approve; show returning to "Google Meet: Connected."
> 5. Create a virtual appointment; open it to show the auto-generated meet.google.com link.
> 6. Cancel the appointment; show the calendar event / meeting is removed.
> 7. Narrate: the app uses Google Calendar only to create and cancel the meetings for this clinician's own appointments, per Limited Use.

**Google field values:** Homepage `https://portal.caymanessentialcare.com`, Privacy `.../privacy`, Terms `.../terms`, Authorized domain `caymanessentialcare.com`. Verify domain ownership in Google Search Console (DNS TXT in Squarespace). While in Testing status, add each tester Gmail as a Test user; refresh tokens expire about weekly until the app is verified.

---

## Status / open items

- Zoom: submission being filled out. Before pressing Submit, the switchover (production creds + APP_URL portal) must be live so the reviewer's test works. Production connect + meeting creation VERIFIED working on the portal domain 2026-09-10.
- Google: verification not started. Domain now exists (portal), so it is unblocked. Still need the Search Console domain verification and the consent-screen scopes, then submit (likely with the demo video).
- Reschedule does not yet update the meeting time (link still works).
