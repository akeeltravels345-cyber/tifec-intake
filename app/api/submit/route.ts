import { NextResponse } from "next/server";
import { getClinician } from "@/lib/clinicians";
import { buildSections, fieldVisible } from "@/lib/forms";
import { encrypt, secureToken, randomId } from "@/lib/crypto";
import { insertSubmission } from "@/lib/db";
import { sendNotification } from "@/lib/email";

export const runtime = "nodejs"; // needs node crypto + nodemailer

export async function POST(req: Request) {
  let payload: { clinicianId?: string; formKey?: string; coupleId?: string; answers?: Record<string, string> };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { clinicianId, answers } = payload;
  if (!clinicianId || !answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Missing clinician or answers." }, { status: 400 });
  }

  const clinician = getClinician(clinicianId);
  if (!clinician) {
    return NextResponse.json({ error: "Unknown clinician." }, { status: 400 });
  }

  // Resolve which form was filled; it must be one this clinician offers.
  const formKey =
    payload.formKey && clinician.forms.includes(payload.formKey as (typeof clinician.forms)[number])
      ? (payload.formKey as (typeof clinician.forms)[number])
      : clinician.forms[0];

  // Server-side validation of required fields (never trust the client).
  const sections = buildSections(formKey, clinician.extraSections);
  for (const section of sections) {
    for (const f of section.fields) {
      if (f.type === "statement" || !f.required) continue;
      if (!fieldVisible(f, answers)) continue; // conditional field not applicable
      const v = answers[f.name];
      if (f.type === "checkbox") {
        if (v !== "true") {
          return NextResponse.json({ error: `Required consent missing: ${f.label}` }, { status: 400 });
        }
      } else if (!v || !String(v).trim()) {
        return NextResponse.json({ error: `Required field missing: ${f.label}` }, { status: 400 });
      }
    }
  }

  const now = new Date().toISOString();
  const token = secureToken();

  // couple_id only applies to the couples form; sanitise to a short safe string.
  const coupleId =
    formKey === "couples" && typeof payload.coupleId === "string"
      ? payload.coupleId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || null
      : null;

  try {
    await insertSubmission({
      id: randomId(),
      clinician_id: clinician.id,
      token,
      form_key: formKey,
      couple_id: coupleId,
      answers_encrypted: encrypt(JSON.stringify(answers)),
      created_at: now,
      status: "new",
      notes_encrypted: null,
    });
  } catch (err) {
    console.error("DB insert failed:", err);
    return NextResponse.json({ error: "Could not save your form. Please try again." }, { status: 500 });
  }

  // Notify the clinician with a secure link only - no PHI in the email.
  try {
    await sendNotification({
      to: clinician.email,
      clinicianName: clinician.name,
      token,
      submittedAt: now,
    });
  } catch (err) {
    // The submission is saved; a failed email shouldn't lose the client's data.
    console.error("Notification email failed:", err);
  }

  return NextResponse.json({ ok: true });
}
