# Encryption key management

The master key (`ENCRYPTION_KEY`) is what makes every piece of client PHI in the
database unreadable without it: intake answers, clinical notes, client profiles,
uploaded documents. Protecting this key **is** protecting the data. This is the
operational plan for it (HIPAA "secure the encryption key" item).

## What the key is

- A 256-bit key, written as **64 hexadecimal characters**.
- Generated with: `openssl rand -hex 32`
- Used for AES-256-GCM encryption at rest (`lib/crypto.ts`) and for the blind
  index that lets us match two records for the same person without storing their
  name in the clear.
- `SESSION_SECRET` (login cookie signing) is managed the same way and listed here
  too, since it has the same handling rules.

## Where it lives (and where it must NOT)

- **Production:** stored only as an environment variable in Vercel
  (Project → Settings → Environment Variables), encrypted at rest by Vercel.
  Nobody needs to paste it anywhere else.
- **Never** in the git repository, in a commit, in a Slack/email message, or in
  a screenshot. `.env`, `.env.local` and all `.env*` files are gitignored, and
  `.env.example` contains placeholders only.
- **Backup:** keep ONE copy of the production key in the practice's password
  manager (e.g. 1Password), in a vault only the owner and Akeel can open.
  If the key is ever lost, the encrypted data **cannot be recovered**. There is
  no "reset". The password-manager copy is the safety net.

## Safety checks now built in

- The app refuses to start handling data if `ENCRYPTION_KEY` is missing, the
  wrong length, non-hex, or a degenerate placeholder (every byte identical).
- `encryptionKeyStatus()` reports (without ever revealing the key) whether it
  is configured, well-formed, and whether a rotation key is set.

## Rotating the key (changing it)

Rotation is supported safely:

1. Generate a new key: `openssl rand -hex 32`
2. In Vercel, set `ENCRYPTION_KEY_OLD` to the **current** key, then set
   `ENCRYPTION_KEY` to the **new** key. Redeploy.
3. New data is now written under the new key; old data still decrypts because
   `decrypt()` automatically falls back to `ENCRYPTION_KEY_OLD`. (The GCM auth
   tag makes a wrong-key attempt fail cleanly, so the fallback is safe.)
4. Let records get re-saved over time, or run a one-off re-encryption pass, so
   everything is stored under the new key.
5. Once nothing depends on the old key, remove `ENCRYPTION_KEY_OLD`.

**Important caveat: the blind index.** Client-matching (the blind index) is
derived from `ENCRYPTION_KEY`. If you rotate the key, existing blind indexes are
computed from the old key and new ones from the new key, so name-based matching
of pre-rotation records will not line up until those records are re-saved. For a
full rotation, plan a re-encryption + re-index pass (or rotate during a quiet
period and re-save the affected records). Routine rotation is not required by
HIPAA; rotate on a known/suspected exposure or staff change, or on a periodic
schedule the practice chooses.

## If the key is exposed

1. Treat it as a security incident (follow the breach-response plan).
2. Rotate immediately using the steps above.
3. Rotate `SESSION_SECRET` too (this signs login cookies); doing so logs everyone
   out, which is the safe outcome.

## Checklist

- [ ] Production `ENCRYPTION_KEY` set only in Vercel env vars
- [ ] One backup copy in the shared password manager, nowhere else
- [ ] `SESSION_SECRET` set and backed up the same way
- [ ] Confirmed no key value appears in the repo or any commit
- [ ] Owner knows: lose the key = lose the data (no recovery)
