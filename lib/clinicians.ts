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

/** Who a clinician can raise a ticket with, or message, in the team area.
 *  Declared here rather than inferred: the owner and the admin both carry
 *  `admin: true`, so nothing else distinguishes them. */
export type ContactRole = "owner" | "biller" | "admin";
export const CONTACT_LABEL: Record<ContactRole, string> = {
  owner: "Practice owner",
  biller: "Biller",
  admin: "Practice admin",
};

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
  /** Admin-only / non-practicing account: hidden from the client-facing clinician picker. */
  intakeHidden?: boolean;
  /** Billing-system role. Omitted = a regular clinician (logs their own sessions).
   *  "biller" = marks insurance payments; "admin" = full billing config + disbursements.
   *  (A practice admin is also a billing admin automatically.) */
  billing?: "biller" | "admin";
  /** BETA: this account can see + open the billing system inside the intake app.
   *  Only enrolled accounts get the "Billing (Beta)" entry point and /billing access. */
  billingBeta?: boolean;
  /** Reachable in the team area as this contact. Clinicians message and assign
   *  tickets to a ROLE, so this is what puts a real person behind it. */
  contact?: ContactRole;
}

// TIFEC clinicians (from caymanessentialcare.com/team) + one practicum trainee.
export const CLINICIANS: Clinician[] = [
  {
    id: "shion-oconnor",
    billingBeta: true, // BETA billing access
    contact: "owner",
    name: "Dr. Shion O'Connor",
    credentials: "Clinical Psychologist & Family Therapist · Founder",
    email: "Therapy@caymanessentialcare.com",
    forms: [
      "individual",
      "couples",
      "dsm5-level1-adult",
      "dsm5-level1-child",
      "dsm5-level1-child-self",
      "psychoed-intake",
      "l2-depression",
      "l2-anxiety",
      "l2-anger",
      "l2-mania",
      "l2-sleep",
      "l2-somatic",
      "l2-repetitive",
      "l2-substance",
      "sev-depression",
      "sev-gad",
      "sev-social-anxiety",
      "sev-separation-anxiety",
      "sev-acute-stress",
      "sev-ptsd",
      "l2p-depression",
      "l2p-anxiety",
      "l2p-anger",
      "l2p-irritability",
      "l2p-mania",
      "l2p-inattention",
      "l2p-sleep",
      "l2p-somatic",
      "l2p-substance",
      "l2c-depression",
      "l2c-anxiety",
      "l2c-anger",
      "l2c-irritability",
      "l2c-mania",
      "l2c-sleep",
      "l2c-somatic",
      "l2c-repetitive",
      "l2c-substance",
    ],
    extraSections: [],
    admin: true,
    selfCheck: true,
  },
  {
    id: "donnet-oconnor",
    billingBeta: true, // BETA billing access
    name: "Dr. Donnet O'Connor",
    credentials: "Ph.D. · Counselling Psychologist & Therapist",
    email: "donnetoconnor@caymanessentialcare.com",
    forms: [
      "individual",
      "couples",
      "dsm5-level1-adult",
      "dsm5-level1-child",
      "dsm5-level1-child-self",
      "psychoed-intake",
      "l2-depression",
      "l2-anxiety",
      "l2-anger",
      "l2-mania",
      "l2-sleep",
      "l2-somatic",
      "l2-repetitive",
      "l2-substance",
      "sev-depression",
      "sev-gad",
      "sev-social-anxiety",
      "sev-separation-anxiety",
      "sev-acute-stress",
      "sev-ptsd",
      "l2p-depression",
      "l2p-anxiety",
      "l2p-anger",
      "l2p-irritability",
      "l2p-mania",
      "l2p-inattention",
      "l2p-sleep",
      "l2p-somatic",
      "l2p-substance",
      "l2c-depression",
      "l2c-anxiety",
      "l2c-anger",
      "l2c-irritability",
      "l2c-mania",
      "l2c-sleep",
      "l2c-somatic",
      "l2c-repetitive",
      "l2c-substance",
    ],
    extraSections: [],
  },
  {
    id: "joan-latty",
    billingBeta: true, // BETA billing access
    name: "Dr. Joan Latty",
    credentials: "Psy.D. · Clinical Psychologist, Marriage & Family Therapist",
    email: "joanlatty@caymanessentialcare.com",
    forms: [
      "individual",
      "couples",
      "dsm5-level1-adult",
      "dsm5-level1-child",
      "dsm5-level1-child-self",
      "psychoed-intake",
      "l2-depression",
      "l2-anxiety",
      "l2-anger",
      "l2-mania",
      "l2-sleep",
      "l2-somatic",
      "l2-repetitive",
      "l2-substance",
      "sev-depression",
      "sev-gad",
      "sev-social-anxiety",
      "sev-separation-anxiety",
      "sev-acute-stress",
      "sev-ptsd",
      "l2p-depression",
      "l2p-anxiety",
      "l2p-anger",
      "l2p-irritability",
      "l2p-mania",
      "l2p-inattention",
      "l2p-sleep",
      "l2p-somatic",
      "l2p-substance",
      "l2c-depression",
      "l2c-anxiety",
      "l2c-anger",
      "l2c-irritability",
      "l2c-mania",
      "l2c-sleep",
      "l2c-somatic",
      "l2c-repetitive",
      "l2c-substance",
    ],
    extraSections: [],
  },
  {
    id: "sofia-hamilton",
    billingBeta: true, // BETA billing access
    name: "Mrs. Sofia Hamilton",
    credentials: "MSc · Educational Psychologist",
    email: "sofiahamilton@caymanessentialcare.com",
    forms: [
      "individual",
      "couples",
      "dsm5-level1-adult",
      "dsm5-level1-child",
      "dsm5-level1-child-self",
      "psychoed-intake",
      "l2-depression",
      "l2-anxiety",
      "l2-anger",
      "l2-mania",
      "l2-sleep",
      "l2-somatic",
      "l2-repetitive",
      "l2-substance",
      "sev-depression",
      "sev-gad",
      "sev-social-anxiety",
      "sev-separation-anxiety",
      "sev-acute-stress",
      "sev-ptsd",
      "l2p-depression",
      "l2p-anxiety",
      "l2p-anger",
      "l2p-irritability",
      "l2p-mania",
      "l2p-inattention",
      "l2p-sleep",
      "l2p-somatic",
      "l2p-substance",
      "l2c-depression",
      "l2c-anxiety",
      "l2c-anger",
      "l2c-irritability",
      "l2c-mania",
      "l2c-sleep",
      "l2c-somatic",
      "l2c-repetitive",
      "l2c-substance",
      "child-behaviour-self",
      "parent-behaviour-assessment",
      "ei-camp-agreement",
      "peers-intake",
    ],
    extraSections: [],
  },
  {
    id: "nick-oconnor",
    billingBeta: true, // BETA billing access
    contact: "biller",
    name: "Nick O'Connor",
    credentials: "Training Clinician (Practicum)",
    email: "tifec.billing@gmail.com",
    forms: [
      "individual",
      "couples",
      "dsm5-level1-adult",
      "dsm5-level1-child",
      "dsm5-level1-child-self",
      "psychoed-intake",
      "l2-depression",
      "l2-anxiety",
      "l2-anger",
      "l2-mania",
      "l2-sleep",
      "l2-somatic",
      "l2-repetitive",
      "l2-substance",
      "sev-depression",
      "sev-gad",
      "sev-social-anxiety",
      "sev-separation-anxiety",
      "sev-acute-stress",
      "sev-ptsd",
      "l2p-depression",
      "l2p-anxiety",
      "l2p-anger",
      "l2p-irritability",
      "l2p-mania",
      "l2p-inattention",
      "l2p-sleep",
      "l2p-somatic",
      "l2p-substance",
      "l2c-depression",
      "l2c-anxiety",
      "l2c-anger",
      "l2c-irritability",
      "l2c-mania",
      "l2c-sleep",
      "l2c-somatic",
      "l2c-repetitive",
      "l2c-substance",
    ],
    extraSections: [],
    billing: "biller", // handles insurer remittances; earns 3% of insurance collected
  },
  // TEST / ADMIN account - remove or rename before go-live.
  {
    id: "akeel-test",
    billingBeta: true, // BETA billing access
    contact: "admin",
    name: "Akeel",
    credentials: "Practice Administrator",
    email: "admin@caymanessentialcare.com",
    forms: [
      "individual",
      "couples",
      "dsm5-level1-adult",
      "dsm5-level1-child",
      "dsm5-level1-child-self",
      "psychoed-intake",
      "l2-depression",
      "l2-anxiety",
      "l2-anger",
      "l2-mania",
      "l2-sleep",
      "l2-somatic",
      "l2-repetitive",
      "l2-substance",
      "sev-depression",
      "sev-gad",
      "sev-social-anxiety",
      "sev-separation-anxiety",
      "sev-acute-stress",
      "sev-ptsd",
      "l2p-depression",
      "l2p-anxiety",
      "l2p-anger",
      "l2p-irritability",
      "l2p-mania",
      "l2p-inattention",
      "l2p-sleep",
      "l2p-somatic",
      "l2p-substance",
      "l2c-depression",
      "l2c-anxiety",
      "l2c-anger",
      "l2c-irritability",
      "l2c-mania",
      "l2c-sleep",
      "l2c-somatic",
      "l2c-repetitive",
      "l2c-substance",
      "child-behaviour-self",
      "parent-behaviour-assessment",
      "ei-camp-agreement",
      "peers-intake",
    ],
    extraSections: [],
    admin: true,
    intakeHidden: true, // admin-only account - not a clinician clients can be assigned to
  },
];

export function getClinician(id: string): Clinician | undefined {
  return CLINICIANS.find((c) => c.id === id);
}

/** The system/builder administrator (contact === "admin", e.g. Akeel) — the
 *  only admin who gets the developer/system tools (data cleanup, email log,
 *  /admin oversight, notice moderation). The practice owner also carries
 *  admin: true for business oversight, but is NOT a system admin. */
export const isSystemAdmin = (c: Clinician | null | undefined): boolean => c?.contact === "admin";

/** The people behind the owner / biller / admin contacts. */
export const CONTACTS = CLINICIANS.filter((c) => !!c.contact);
export const contactFor = (role: ContactRole): Clinician | undefined => CLINICIANS.find((c) => c.contact === role);
export const isContact = (id: string): boolean => CONTACTS.some((c) => c.id === id);

export function getClinicianByEmail(email: string): Clinician | undefined {
  const normalized = email.trim().toLowerCase();
  return CLINICIANS.find((c) => c.email.toLowerCase() === normalized);
}
