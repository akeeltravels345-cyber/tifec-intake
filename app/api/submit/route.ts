import { NextResponse } from "next/server";
import { getClinician } from "@/lib/clinicians";
import { buildSections, fieldVisible, templateLabel } from "@/lib/forms";
import { encrypt, secureToken, randomId } from "@/lib/crypto";
import { insertSubmission } from "@/lib/db";
import { addClients, type ClientInput } from "@/lib/clients";
import type { ClientProfile } from "@/lib/clients";
import { sendNotification } from "@/lib/email";

export const runtime = "nodejs"; // needs node crypto + nodemailer

const splitName = (full: string): { first: string; last: string } => {
  const p = full.trim().replace(/\s+/g, " ").split(" ");
  return p.length <= 1 ? { first: p[0] ?? "", last: "" } : { first: p[0], last: p.slice(1).join(" ") };
};

/** Turn an intake submission into the client(s) it's for, so a new intake for
 *  someone not yet on file auto-creates their client record (and an existing
 *  person just links). Handles the individual form and both people on a couples
 *  form. Only maps what intake reliably carries; the biller enriches the rest. */
function clientsFromAnswers(a: Record<string, string>): ClientInput[] {
  const mk = (name?: string, email?: string): ClientInput | null => {
    if (!name || !name.trim()) return null;
    const { first, last } = splitName(name);
    const profile: ClientProfile = {};
    if (a.dob && String(a.dob).trim()) profile.dob = String(a.dob).trim();
    const em = (email && email.trim()) || (a.email && String(a.email).trim()) || "";
    if (em) profile.email = em;
    const phone = (a.cell_phone && String(a.cell_phone).trim()) || (a.home_phone && String(a.home_phone).trim()) || "";
    if (phone) profile.phone = phone;
    // Intake keeps address as one free-text field; drop it in line 1 so the biller
    // sees it, rather than guessing at street/city/postal splits.
    if (a.address && String(a.address).trim()) profile.address = { line1: String(a.address).trim() };
    return { first, last, insurerId: null, profile };
  };
  const out: ClientInput[] = [];
  for (const c of [mk(a.full_name, a.email), mk(a.his_name, a.his_email), mk(a.hers_name, a.hers_email)]) if (c) out.push(c);
  return out;
}

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
  // A key we don't recognise is rejected rather than silently coerced: falling
  // back to the clinician's first form would file the client's answers against
  // the wrong template, so the record would render with mismatched questions.
  const isOffered = (k: unknown): k is (typeof clinician.forms)[number] =>
    typeof k === "string" && (clinician.forms as readonly string[]).includes(k);

  if (payload.formKey !== undefined && !isOffered(payload.formKey)) {
    return NextResponse.json({ error: "Unknown form for this clinician." }, { status: 400 });
  }
  const formKey = isOffered(payload.formKey) ? payload.formKey : clinician.forms[0];

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

  // Make the client record the hub: find-or-create the client(s) this intake is
  // for and link them to the clinician. Best-effort — a hiccup here must never
  // fail or slow the client's submission (which is already safely saved).
  try {
    const inputs = clientsFromAnswers(answers);
    if (inputs.length) await addClients(clinician.id, inputs);
  } catch (err) {
    console.error("intake -> client sync failed:", err);
  }

  // Notify the clinician with a secure link only - no PHI in the email.
  try {
    await sendNotification({
      to: clinician.email,
      clinicianName: clinician.name,
      token,
      submittedAt: now,
      formLabel: templateLabel(formKey),
    });
  } catch (err) {
    // The submission is saved; a failed email shouldn't lose the client's data.
    console.error("Notification email failed:", err);
  }

  return NextResponse.json({ ok: true });
}
