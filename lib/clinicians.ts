// =============================================================================
// TIFEC clinician roster  ──  EDIT THIS FILE
// -----------------------------------------------------------------------------
// Add the real name and TIFEC email address for each of your 5 psychologists.
// `id` is used in the form URL (e.g. /intake?clinician=dr-smith) and must be
// unique, lowercase, and contain no spaces.
//
// `forms` is the list of intake forms this clinician offers. Each becomes its
// own shareable link on their dashboard. Available keys (see lib/forms.ts):
//   "individual" → the standard Client Intake Form (adults / children)
//   "couples"    → the His/Hers Couples Intake Form
// Give a clinician several forms if they see different client types, e.g.
//   forms: ["individual", "couples"]
// The Informed Consent for Psychotherapy is appended to every form automatically.
//
// `extraSections` lets a clinician add their own questions on top of their
// forms (e.g. the child/adolescent guardian section). Leave it [] if none.
// =============================================================================

import type { FormSection, FormTemplateKey } from "./forms";

export interface Clinician {
  id: string;
  name: string;
  credentials: string; // e.g. "Ph.D., Clinical Psychologist"
  email: string; // where the "new submission" notification is sent
  /** One or more intake forms this clinician offers (must be non-empty). */
  forms: FormTemplateKey[];
  /** Optional clinician-specific questions appended after each form's body. */
  extraSections: FormSection[];
  /** Practice admins can oversee ALL clinicians' submissions and manage logins. */
  admin?: boolean;
  /** Shows the shareable public Wellbeing Self-Check card on the dashboard. */
  selfCheck?: boolean;
  /** Billing-system role. Omitted = a regular clinician (logs their own sessions).
   *  "biller" = marks insurance payments; "admin" = full billing config + disbursements.
   *  (A practice admin is also a billing admin automatically.) */
  billing?: "biller" | "admin";
}

// TIFEC clinicians (from caymanessentialcare.com/team) + one practicum trainee.
export const CLINICIANS: Clinician[] = [
  {
    id: "shion-oconnor",
    name: "Dr. Shion O'Connor",
    credentials: "Clinical Psychologist & Family Therapist · Founder",
    email: "Therapy@caymanessentialcare.com",
    forms: ["individual", "couples", "dsm5-level1-adult", "dsm5-level1-child"],
    extraSections: [],
    admin: true,
    selfCheck: true,
  },
  {
    id: "donnet-oconnor",
    name: "Dr. Donnet O'Connor",
    credentials: "Ph.D. · Counselling Psychologist & Therapist",
    email: "donnetoconnor@caymanessentialcare.com",
    forms: ["individual", "couples", "dsm5-level1-adult", "dsm5-level1-child"],
    extraSections: [],
  },
  {
    id: "joan-latty",
    name: "Dr. Joan Latty",
    credentials: "Psy.D. · Clinical Psychologist, Marriage & Family Therapist",
    email: "joanlatty@caymanessentialcare.com",
    forms: ["individual", "couples", "dsm5-level1-adult", "dsm5-level1-child"],
    extraSections: [],
  },
  {
    id: "sofia-hamilton",
    name: "Mrs. Sofia Hamilton",
    credentials: "MSc · Educational Psychologist",
    email: "sofiahamilton@caymanessentialcare.com",
    forms: ["individual", "couples", "dsm5-level1-adult", "dsm5-level1-child"],
    extraSections: [],
  },
  {
    id: "nick-oconnor",
    name: "Nick O'Connor",
    credentials: "Training Clinician (Practicum)",
    email: "tifec.billing@gmail.com",
    forms: ["individual", "couples", "dsm5-level1-adult", "dsm5-level1-child"],
    extraSections: [],
  },
  // TEST / ADMIN account - remove or rename before go-live.
  {
    id: "akeel-test",
    name: "Akeel (Test)",
    credentials: "Practice Administrator",
    email: "admin@caymanessentialcare.com",
    forms: ["individual", "couples", "dsm5-level1-adult", "dsm5-level1-child"],
    extraSections: [],
    admin: true,
  },
];

export function getClinician(id: string): Clinician | undefined {
  return CLINICIANS.find((c) => c.id === id);
}

export function getClinicianByEmail(email: string): Clinician | undefined {
  const normalized = email.trim().toLowerCase();
  return CLINICIANS.find((c) => c.email.toLowerCase() === normalized);
}
