// =============================================================================
// New-client intake routing. Decides which intake form(s) a booking needs and
// whether this client has them on file yet, so the booking flow can auto-send
// the right link and the clinician can see who is still outstanding.
//
//   - Couples / Marriage / Pre-Marital services  -> Couples Intake
//   - Free Online Consultation                   -> no intake (a pre-therapy chat)
//   - Everything else                            -> General Intake + DSM-5 screener
//
// "Has it on file" is judged by matching the client's name against submitted
// intake forms (lib/intakeLink.findIntakeForClient); if the required form has
// never been submitted, the client needs it (new client, or a returning one who
// never completed it) and gets a reminder before their next appointment.
// =============================================================================

import type { FormTemplateKey } from "./forms";
import { findIntakeForClient } from "./intakeLink";

export function isCoupleService(name: string): boolean {
  // Couples / Marriage / Pre-Marital only. Family + Parent & Child use general.
  return /\b(couples?|marriage|pre[\s-]?marital)\b/i.test(name);
}

export function skipsIntake(name: string): boolean {
  return /free\s+online\s+consultation/i.test(name);
}

/** The intake form(s) a booking of this service requires. */
export function requiredIntakeForms(typeName: string): FormTemplateKey[] {
  if (skipsIntake(typeName)) return [];
  if (isCoupleService(typeName)) return ["couples"];
  return ["individual", "dsm5-level1-adult"];
}

/** The path a client visits to fill a given form (tied to their clinician). */
export function intakeLinkPath(clinicianId: string, form: FormTemplateKey, coupleId?: string): string {
  if (form === "couples") return `/intake?clinician=${encodeURIComponent(clinicianId)}&couple=${encodeURIComponent(coupleId || "")}`;
  return `/intake?clinician=${encodeURIComponent(clinicianId)}&form=${encodeURIComponent(form)}`;
}

/** Short client-facing name for a required form, for email + status copy. */
export function formShortLabel(form: FormTemplateKey): string {
  if (form === "couples") return "Couples Intake";
  if (form === "individual") return "General Intake";
  if (form === "dsm5-level1-adult") return "Wellbeing Screening (DSM-5)";
  return String(form);
}

const splitName = (full: string) => {
  const p = full.trim().split(/\s+/);
  return { first: p[0] || "", last: p.slice(1).join(" ") || "" };
};

export type IntakeStatus = "not_required" | "pending" | "received";
export interface IntakeAssessment {
  requiredForms: FormTemplateKey[];
  submittedForms: FormTemplateKey[];
  missingForms: FormTemplateKey[];
  status: IntakeStatus;
  needsIntake: boolean;
}

/** Assess a client's intake for a service by name (and email, when given):
 *  which forms are required, which are already on file, and whether anything is
 *  still outstanding. Matching on email as well as name means a returning client
 *  whose name changed slightly is still recognised. */
export async function assessClientIntake(clientName: string, typeName: string, email?: string): Promise<IntakeAssessment> {
  const requiredForms = requiredIntakeForms(typeName);
  if (requiredForms.length === 0) {
    return { requiredForms, submittedForms: [], missingForms: [], status: "not_required", needsIntake: false };
  }
  const { first, last } = splitName(clientName);
  let submittedForms: FormTemplateKey[] = [];
  try {
    const hits = await findIntakeForClient(first, last, undefined, email);
    submittedForms = [...new Set(hits.map((h) => h.formKey))];
  } catch { /* nothing on file if the store is unreachable */ }
  const missingForms = requiredForms.filter((f) => !submittedForms.includes(f));
  return {
    requiredForms,
    submittedForms,
    missingForms,
    status: missingForms.length === 0 ? "received" : "pending",
    needsIntake: missingForms.length > 0,
  };
}
