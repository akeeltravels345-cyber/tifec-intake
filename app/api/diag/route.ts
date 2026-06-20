// TEMPORARY SMTP diagnostic — gated by the admin key. Remove after debugging.
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import crypto from "crypto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const p = process.env.SMTP_PASS || "";
  const env = {
    SMTP_HOST: process.env.SMTP_HOST || null,
    SMTP_PORT: process.env.SMTP_PORT || null,
    SMTP_USER: process.env.SMTP_USER || null,
    SMTP_FROM: process.env.SMTP_FROM || null,
    SMTP_PASS_set: !!p,
    SMTP_PASS_len: p.length,
    // Google app passwords are exactly 16 lowercase letters, no spaces/digits.
    SMTP_PASS_is_valid_format: /^[a-z]{16}$/.test(p),
    SMTP_PASS_has_space: /\s/.test(p),
    SMTP_PASS_has_uppercase: /[A-Z]/.test(p),
    SMTP_PASS_has_digit: /[0-9]/.test(p),
    SMTP_PASS_fp: p ? crypto.createHash("sha256").update(p).digest("hex").slice(0, 8) : null,
    APP_URL: process.env.APP_URL || null,
  };

  const send: Record<string, unknown> = { attempted: false };
  const to = url.searchParams.get("to");
  if (process.env.SMTP_HOST && to) {
    send.attempted = true;
    try {
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await t.verify();
      const info = await t.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: "TIFEC SMTP diagnostic",
        text: "This is a TIFEC SMTP connectivity test.",
      });
      send.ok = true;
      send.response = info.response;
    } catch (e) {
      const err = e as { message?: string; code?: string; responseCode?: number };
      send.ok = false;
      send.error = err.message ?? String(e);
      send.code = err.code ?? null;
      send.responseCode = err.responseCode ?? null;
    }
  }

  return NextResponse.json({ env, send });
}
