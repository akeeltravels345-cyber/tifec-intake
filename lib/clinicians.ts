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
  /** Headshot in /public/clinicians, shown on the booking page and calendar. */
  photo?: string;
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
  /** A practicum (training) clinician who ALSO holds a billing role (e.g. Nick,
   *  who is the biller). Their practicum clients are unpaid, so they're kept out
   *  of the paid/bookable clinician lists, but they CAN be assigned clients as a
   *  treating clinician (no-charge records) so they can keep session notes. */
  practicum?: boolean;
  /** Bookable, but hidden from the public clinician picker and the "any
   *  available" pool. Reachable only via a direct link (/book?clinician=<id>),
   *  e.g. Nick for his practicum clients. */
  privateBooking?: boolean;
  /** Reachable in the team area as this contact. Clinicians message and assign
   *  tickets to a ROLE, so this is what puts a real person behind it. */
  contact?: ContactRole;
  /** A throwaway TEST account. Kept out of billing, booking, intake and client
   *  assignment (it is also `intakeHidden`), but allowed into the schedule +
   *  video-connection screens so the flow can be exercised. Remove before real
   *  use. */
  test?: boolean;
}

// TIFEC clinicians (from caymanessentialcare.com/team) + one practicum trainee.
export const CLINICIANS: Clinician[] = [
  {
    id: "shion-oconnor",
    billingBeta: true, // BETA billing access
    contact: "owner",
    name: "Dr. Shion O'Connor",
    photo: "/clinicians/shion-oconnor.webp",
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
    photo: "/clinicians/donnet-oconnor.webp",
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
    photo: "/clinicians/joan-latty.webp",
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
    photo: "/clinicians/sofia-hamilton.webp",
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
    practicum: true, // biller who also treats practicum (unpaid) clients — assignable as a treating clinician for session notes
    privateBooking: true, // bookable for his practicum clients via a direct link, hidden from the public picker
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
  // TEST clinician for exercising the schedule + video-connection flow.
  // Hidden from billing / booking / intake / client assignment; only the
  // schedule and video screens let it in. Remove before go-live.
  {
    id: "test-clinician",
    name: "Test Clinician",
    credentials: "Test account",
    email: "test-clinician@caymanessentialcare.com",
    forms: ["individual"],
    extraSections: [],
    intakeHidden: true,   // keeps it out of the public picker, intake, client lists and billing rosters
    test: true,           // opens the schedule + video-connection gates for it
    privateBooking: true, // allow booking it by direct link (for end-to-end calendar testing)
  },
];

export function getClinician(id: string): Clinician | undefined {
  return CLINICIANS.find((c) => c.id === id);
}

/** Shown in the public booking picker and included in the "any available" pool. */
export const isPublicBookable = (c: Clinician): boolean => !c.intakeHidden && c.contact !== "biller";
/** Can be booked at all — public clinicians plus private-link-only ones (Nick). */
export const isBookableClinician = (c: Clinician): boolean => isPublicBookable(c) || !!c.privateBooking;
/** The public list for the booking picker. */
export const publicBookableClinicians = (): Clinician[] => CLINICIANS.filter(isPublicBookable);

/** The system/builder administrator (contact === "admin", e.g. Akeel) — the
 *  only admin who gets the developer/system tools (data cleanup, email log,
 *  /admin oversight, notice moderation). The practice owner also carries
 *  admin: true for business oversight, but is NOT a system admin. */
export const isSystemAdmin = (c: Clinician | null | undefined): boolean => c?.contact === "admin";

// BETA ROLLOUT: the new scheduling system is live only for these clinicians
// (Shion + Nick), plus the admin and the test account (for Zoom review). Everyone
// else is kept out of /schedule for now. Widen this to open it to the whole team.
const SCHEDULE_BETA_IDS = new Set<string>(["shion-oconnor", "nick-oconnor"]);
export const inScheduleBeta = (c: Clinician | null | undefined): boolean =>
  !!c && (isSystemAdmin(c) || !!c.test || SCHEDULE_BETA_IDS.has(c.id));

/** Can this internal person be assigned clients as their treating clinician?
 *  Regular clinicians can; the biller normally can't — except a practicum biller
 *  (Nick), whose unpaid practicum clients live as no-charge records so he can
 *  keep session notes. Never a hidden/admin-only account. */
export const canTreatClients = (c: Clinician | null | undefined): boolean =>
  !!c && !c.intakeHidden && (c.contact !== "biller" || !!c.practicum);

/** The people behind the owner / biller / admin contacts. */
export const CONTACTS = CLINICIANS.filter((c) => !!c.contact);
export const contactFor = (role: ContactRole): Clinician | undefined => CLINICIANS.find((c) => c.contact === role);
export const isContact = (id: string): boolean => CONTACTS.some((c) => c.id === id);

export function getClinicianByEmail(email: string): Clinician | undefined {
  const normalized = email.trim().toLowerCase();
  return CLINICIANS.find((c) => c.email.toLowerCase() === normalized);
}
