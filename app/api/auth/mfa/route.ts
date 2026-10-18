import { NextResponse } from "next/server";
import {
  getMfaChallengeClinicianId,
  setSessionCookie,
  clearMfaChallengeCookie,
} from "@/lib/auth";
import { getMfaState, getMfaSecret, getBackupHashes, removeBackupHash } from "@/lib/users";
import { verifyCode, verifyBackupCode } from "@/lib/totp";
import { logAuth } from "@/lib/db";
import { rateLimit, rateLimitReset } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Step two of two-step login. The browser has a short-lived MFA challenge cookie
// (set by /api/auth/login after a correct password); here we verify the one-time
// code (or a backup code) and only then hand out a real session.
export async function POST(req: Request) {
  const cid = await getMfaChallengeClinicianId();
  if (!cid) {
    return NextResponse.json({ error: "Your sign-in timed out. Please enter your password again." }, { status: 401 });
  }

  // Limit code guesses: 8 per 15 minutes per account.
  const key = `mfa:${cid}`;
  const limit = rateLimit(key, 8, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).` },
      { status: 429 }
    );
  }

  let body: { code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const code = (body.code || "").trim();
  if (!code) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const state = await getMfaState(cid);
  if (!state.enabled) {
    // Shouldn't happen (challenge only issued when enabled), but fail safe.
    return NextResponse.json({ error: "Two-step login isn't set up for this account." }, { status: 400 });
  }

  let ok = false;
  let usedBackup = false;

  const secret = await getMfaSecret(cid);
  if (secret && verifyCode(secret, code)) {
    ok = true;
  } else {
    // Fall back to a one-time backup code, then burn it so it can't be reused.
    const hashes = await getBackupHashes(cid);
    const match = hashes.find((h) => verifyBackupCode(code, h));
    if (match) { ok = true; usedBackup = true; await removeBackupHash(cid, match); }
  }

  if (!ok) {
    await logAuth(cid, "login_failed", "failed two-step code");
    return NextResponse.json({ error: "That code wasn't right. Check your authenticator app and try again." }, { status: 401 });
  }

  try {
    await setSessionCookie(cid);
  } catch {
    return NextResponse.json(
      { error: "Server session is not configured (SESSION_SECRET). Contact your administrator." },
      { status: 500 }
    );
  }
  await clearMfaChallengeCookie();
  rateLimitReset(key);
  await logAuth(cid, "login", usedBackup ? "signed in (two-step, backup code)" : "signed in (two-step)");
  return NextResponse.json({ ok: true, usedBackup, backupRemaining: usedBackup ? Math.max(0, state.backupRemaining - 1) : state.backupRemaining });
}
