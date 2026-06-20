# Deploying TIFEC to a shareable URL (Vercel + Neon)

Goal: a private web link you can open on any device to demo the prototype.
Time: ~20–30 min. Cost: $0 on free tiers for a demo.

You'll create three free accounts (if you don't have them): **Neon** (database),
**GitHub** (code), **Vercel** (hosting). Your generated secrets are in
`PRODUCTION-SECRETS.local.txt` (gitignored — keep it private, delete after).

---

## Step 1 — Database (Neon)

1. Sign up at https://neon.com and create a new project.
   - Pick the **region closest to Cayman** (e.g. US East) — this is your data location.
2. Copy the **connection string** (looks like `postgresql://user:pass@...neon.tech/db?sslmode=require`). This is your `DATABASE_URL`.
3. Open the Neon **SQL Editor**, paste the contents of `db/schema.sql`, and run it (creates the tables).

## Step 2 — Push code to GitHub

The repo is already committed locally. Create an empty repo on GitHub (e.g. `tifec-intake`, **private**), then:

```bash
cd ~/tifec-intake
git remote add origin https://github.com/<your-username>/tifec-intake.git
git branch -M main
git push -u origin main
```

## Step 3 — Deploy on Vercel

1. Sign up at https://vercel.com (log in with GitHub).
2. **Add New → Project → Import** your `tifec-intake` repo. Framework auto-detects as Next.js.
3. Before clicking Deploy, open **Environment Variables** and add (Production):

   | Name | Value |
   |---|---|
   | `ENCRYPTION_KEY` | from `PRODUCTION-SECRETS.local.txt` |
   | `SESSION_SECRET` | from `PRODUCTION-SECRETS.local.txt` |
   | `ADMIN_PASSWORD` | from `PRODUCTION-SECRETS.local.txt` |
   | `DATABASE_URL` | your Neon string from Step 1 |
   | `APP_URL` | `https://temp` (you'll fix this in Step 4) |

   Optional (only if demoing email notifications): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
4. Click **Deploy**. You'll get a URL like `https://tifec-intake-xxxx.vercel.app`.

## Step 4 — Point APP_URL at the real domain

1. In Vercel → Settings → Environment Variables, set `APP_URL` to your actual
   `https://...vercel.app` URL (used to build the secure client links).
2. **Redeploy** (Deployments → ⋯ → Redeploy) so the change takes effect.

## Step 5 — Create logins

1. Go to `https://<your-domain>/admin?key=<ADMIN_PASSWORD>` (the admin password from the secrets file).
2. Set a password for each clinician you want to demo (and for the admin account `akeel-test`).
3. Sign in normally at `https://<your-domain>/login`.

Done — share the URL and log in.

---

## Notes
- **Free tier caveat:** fine for a demo. Before real client data, move to a paid Neon/Vercel plan and get data-processing agreements (see the proposal's scope note).
- **Faster alternative (no GitHub):** `npm i -g vercel`, then `vercel` (follow prompts to log in + link), add the env vars with `vercel env add`, then `vercel --prod`.
- **Updating later:** push to `main` → Vercel auto-deploys.
- **Security:** the app already enforces HTTPS-only cookies, security headers, encryption at rest, and idle logout in production.
