import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentClinician } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth";
import {
  getUser,
  getMfaState,
  getMfaSecret,
  setMfaPendingSecret,
  enableMfa,
  disableMfa,
} from "@/lib/users";
import {
  generateSecret,
  otpauthUri,
  verifyCode,
  generateBackupCodes,
  hashBackupCode,
} from "@/lib/totp";
import { logAccess } from "@/lib/db";

export const runtime = "nodejs";

function audit(clinicianId: string, detail: string) {
  return logAccess({
    id: crypto.randomUUID(),
    clinician_id: clinicianId,
    submission_token: "",
    action: "status",
    detail,
    at: new Date().toISOString(),
  });
}

// Manage the signed-in user's own two-step login.
//   action: "start"   → make a new secret, return QR + typed key (not yet on)
//   action: "enable"  → confirm a code, turn it on, return one-time backup codes
//   action: "disable" → turn it off (requires a current code or the password)
export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { action?: string; code?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = body.action;

  if (action === "start") {
    const secret = generateSecret();
    await setMfaPendingSecret(me.id, secret);
    const uri = otpauthUri(secret, me.email || me.name);
    let qr = "";
    try { qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 }); } catch { /* fall back to typed key */ }
    await audit(me.id, "started two-step login setup");
    // The secret is shown only during setup so the user can add it to their app.
    return NextResponse.json({ ok: true, secret, otpauth: uri, qr });
  }

  if (action === "enable") {
    const code = (body.code || "").trim();
    const secret = await getMfaSecret(me.id);
    if (!secret) return NextResponse.json({ error: "Start the setup again — no pending code was found." }, { status: 400 });
    if (!verifyCode(secret, code)) {
      return NextResponse.json({ error: "That code wasn't right. Make sure your phone's time is correct and try the current code." }, { status: 400 });
    }
    const backupCodes = generateBackupCodes(10);
    await enableMfa(me.id, backupCodes.map(hashBackupCode));
    await audit(me.id, "turned ON two-step login");
    // Backup codes are returned ONCE here and never stored in readable form.
    return NextResponse.json({ ok: true, backupCodes });
  }

  if (action === "disable") {
    const state = await getMfaState(me.id);
    if (!state.enabled) return NextResponse.json({ ok: true }); // already off
    // Prove it's really you: accept a current authenticator code OR the password.
    const code = (body.code || "").trim();
    const password = body.password || "";
    const secret = await getMfaSecret(me.id);
    let allowed = !!(secret && code && verifyCode(secret, code));
    if (!allowed && password) {
      try {
        const user = await getUser(me.id);
        allowed = !!(user && verifyPassword(password, user.password_hash));
      } catch { allowed = false; }
    }
    if (!allowed) {
      return NextResponse.json({ error: "Enter a current code or your password to turn off two-step login." }, { status: 400 });
    }
    await disableMfa(me.id);
    await audit(me.id, "turned OFF two-step login");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
