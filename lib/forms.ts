// =============================================================================
// TIFEC intake form definitions - digitized from the practice's paper forms:
//   • Client Intake Form (individual adult)         -> INDIVIDUAL_INTAKE
//   • Intake Form for Couples (His/Hers)            -> COUPLES_INTAKE
//   • Informed Consent for Psychotherapy            -> INFORMED_CONSENT (appended)
//
// A clinician offers one or more forms (set via `forms` in lib/clinicians.ts),
// may add their own `extraSections`, and the Informed Consent is appended to all.
// =============================================================================

import { LEVEL2_MEASURES, level2Sections } from "./level2";

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "date"
  | "number"
  | "select"
  | "radio"
  | "checkbox" // single acknowledgement checkbox
  | "checkboxgroup" // "select all that apply"
  | "statement"; // read-only text, collects no value

/**
 * Conditional visibility. A field shows only when its `showIf` matches the
 * current answers. Multiple conditions (array) must ALL match (AND).
 *   equals   - controlling field's value === equals
 *   in       - controlling value is one of these
 *   includes - controlling value (a "A, B" multi-select) contains this option
 *   notEmpty - controlling value is non-empty
 */
export interface FieldCondition {
  field: string;
  equals?: string;
  in?: string[];
  includes?: string;
  notEmpty?: boolean;
  /** Controlling field is a date of birth; matches when the computed age is below this. */
  ageUnder?: number;
}

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
  /** De-emphasised supplementary text shown right after the question (e.g. long example lists). */
  examples?: string;
  /** Render radio options stacked vertically (a rating scale) instead of wrapping chips. */
  stack?: boolean;
  showIf?: FieldCondition | FieldCondition[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  intro?: string[]; // read-only paragraphs shown before the fields (e.g. consent text)
  titleBelowIntro?: boolean; // render the title AFTER the intro paragraphs (as a lead-in to the questions)
  fields: FormField[];
}

export type FormTemplateKey =
  | "individual"
  | "couples"
  | "dsm5-level1-adult"
  | "dsm5-level1-child"
  | "dsm5-level1-child-self"
  | "psychoed-intake"
  | "child-behaviour-self"
  | "parent-behaviour-assessment"
  | "ei-camp-agreement"
  | "l2p-depression"
  | "l2p-anxiety"
  | "l2p-anger"
  | "l2p-irritability"
  | "l2p-mania"
  | "l2p-inattention"
  | "l2p-sleep"
  | "l2p-somatic"
  | "l2p-substance"
  | "l2c-depression"
  | "l2c-anxiety"
  | "l2c-anger"
  | "l2c-irritability"
  | "l2c-mania"
  | "l2c-sleep"
  | "l2c-somatic"
  | "l2c-repetitive"
  | "l2c-substance"
  | "l2-depression"
  | "l2-anxiety"
  | "l2-anger"
  | "l2-mania"
  | "l2-sleep"
  | "l2-somatic"
  | "l2-repetitive"
  | "l2-substance"
  | "sev-depression"
  | "sev-gad"
  | "sev-social-anxiety"
  | "sev-separation-anxiety"
  | "sev-acute-stress"
  | "sev-ptsd";

// ---- shared option lists -------------------------------------------------
const YES_NO = ["Yes", "No"];
const HEALTH_RATING = ["Poor", "Unsatisfactory", "Satisfactory", "Good", "Very good"];
const MARITAL = ["Never Married", "Married", "Separated", "Divorced", "Widowed", "Domestic Partnership"];
const DRUG_FREQ = ["Daily", "Weekly", "Monthly", "Infrequently", "I don't use drugs"];
const FAMILY_CONDITIONS = [
  "Alcohol/Substance Abuse",
  "Anxiety",
  "Depression",
  "Domestic Violence",
  "Eating Disorders",
  "Obesity",
  "Obsessive Compulsive Behavior",
  "Schizophrenia",
  "Suicide Attempts",
];
const EMAIL_NOTE = "Email correspondence is not considered to be a confidential medium of communication.";

// =============================================================================
// INDIVIDUAL ADULT INTAKE  (from "Client Intake Form")
// =============================================================================
export const INDIVIDUAL_INTAKE: FormSection[] = [
  {
    id: "personal",
    title: "Personal Information",
    description: "Information provided on this form is protected as confidential information.",
    fields: [
      { name: "full_name", label: "Full name", type: "text", required: true },
      { name: "dob", label: "Date of birth", type: "date", required: true },
      { name: "gender", label: "Gender", type: "text" },
      {
        name: "guardian_name",
        label: "Parent / Legal Guardian's full name",
        type: "text",
        required: true,
        help: "Required for clients under 18.",
        showIf: { field: "dob", ageUnder: 18 },
      },
      { name: "address", label: "Address", type: "textarea" },
      { name: "home_phone", label: "Home phone", type: "tel" },
      { name: "cell_phone", label: "Cell / Work / Other phone", type: "tel", required: true },
      { name: "email", label: "Email", type: "email", required: true, help: EMAIL_NOTE },
    ],
  },
  {
    id: "marital-history",
    title: "Marital History",
    fields: [
      { name: "marital_status", label: "Marital status", type: "radio", options: MARITAL },
      { name: "married_how_long", label: "How long have you been married?", type: "text", showIf: { field: "marital_status", equals: "Married" } },
      {
        name: "married_before",
        label: "Have you been married before?",
        type: "radio",
        options: YES_NO,
        showIf: { field: "marital_status", in: ["Married", "Separated", "Divorced", "Widowed", "Domestic Partnership"] },
      },
      { name: "times_married", label: "If yes, how many times?", type: "number", showIf: { field: "married_before", equals: "Yes" } },
      { name: "has_children", label: "Do you have children?", type: "radio", options: YES_NO },
      { name: "children_count", label: "How many children (boys / girls)?", type: "text", showIf: { field: "has_children", equals: "Yes" } },
      {
        name: "divorce_cause",
        label: "What would you say is the cause for your divorce or separation?",
        type: "textarea",
        showIf: { field: "marital_status", in: ["Divorced", "Separated"] },
      },
      {
        name: "in_relationship",
        label: "Are you currently in a romantic relationship?",
        type: "radio",
        options: YES_NO,
        showIf: { field: "marital_status", in: ["Never Married", "Separated", "Divorced", "Widowed"] },
      },
      { name: "relationship_length", label: "If yes, for how long?", type: "text", showIf: { field: "in_relationship", equals: "Yes" } },
      {
        name: "relationship_rating",
        label: "On a scale of 1-10 (1 poor, 10 exceptional), how would you rate your relationship?",
        type: "number",
        showIf: { field: "in_relationship", equals: "Yes" },
      },
      { name: "referred_by", label: "Who referred you to this office (if any)?", type: "text" },
    ],
  },
  {
    id: "reasons",
    title: "Reason for Seeking Help",
    fields: [
      {
        name: "reasons_for_help",
        label: "What are the reasons you are seeking help?",
        type: "textarea",
        required: true,
        help:
          "If you are in crisis, call 911 or go to your nearest emergency room - this form is not monitored in real time.",
      },
    ],
  },
  {
    id: "mental-health-history",
    title: "Mental Health History",
    fields: [
      {
        name: "prior_mh_services",
        label: "Have you previously received any mental health services (psychotherapy, psychiatric, etc.)?",
        type: "radio",
        options: YES_NO,
      },
      { name: "prior_mh_for", label: "If yes, what for?", type: "text", showIf: { field: "prior_mh_services", equals: "Yes" } },
      {
        name: "previous_therapist",
        label: "Who was your previous therapist / practitioner?",
        type: "text",
        showIf: { field: "prior_mh_services", equals: "Yes" },
      },
      { name: "current_meds", label: "Are you currently taking any prescription medication?", type: "radio", options: YES_NO },
      {
        name: "current_meds_list",
        label: "Please list (name, dosage, date started)",
        type: "textarea",
        showIf: { field: "current_meds", equals: "Yes" },
      },
      { name: "psych_meds_ever", label: "Have you ever been prescribed psychiatric medication?", type: "radio", options: YES_NO },
      {
        name: "psych_meds_list",
        label: "Please list (name, dosage, dates)",
        type: "textarea",
        showIf: { field: "psych_meds_ever", equals: "Yes" },
      },
    ],
  },
  {
    id: "general-health",
    title: "General and Mental Health Information",
    fields: [
      { name: "physical_health_rating", label: "How would you rate your current physical health?", type: "radio", options: HEALTH_RATING },
      { name: "health_problems", label: "Please list any specific health problems you are currently experiencing", type: "textarea" },
      { name: "sleep_rating", label: "How would you rate your current sleeping habits?", type: "radio", options: HEALTH_RATING },
      { name: "sleep_problems", label: "Please list any specific sleep problems you are currently experiencing", type: "textarea" },
      { name: "exercise_freq", label: "How many times per week do you generally exercise?", type: "text" },
      { name: "exercise_types", label: "What types of exercise do you participate in?", type: "text" },
      { name: "appetite_problems", label: "Please list any difficulties with your appetite or eating", type: "textarea" },
      { name: "depression", label: "Are you currently experiencing overwhelming sadness, grief, or depression?", type: "radio", options: YES_NO },
      { name: "depression_duration", label: "For approximately how long?", type: "text", showIf: { field: "depression", equals: "Yes" } },
      { name: "anxiety", label: "Are you currently experiencing anxiety, panic attacks, or any phobias?", type: "radio", options: YES_NO },
      { name: "anxiety_onset", label: "When did you begin experiencing this?", type: "text", showIf: { field: "anxiety", equals: "Yes" } },
      { name: "chronic_pain", label: "Are you currently experiencing any chronic pain?", type: "radio", options: YES_NO },
      { name: "chronic_pain_desc", label: "Please describe", type: "text", showIf: { field: "chronic_pain", equals: "Yes" } },
    ],
  },
  {
    id: "drug-history",
    title: "Drug History",
    fields: [
      { name: "alcohol", label: "Do you drink alcohol?", type: "radio", options: YES_NO },
      { name: "alcohol_freq", label: "How many times per week do you drink alcohol?", type: "text", showIf: { field: "alcohol", equals: "Yes" } },
      { name: "drug_use_freq", label: "How often do you engage in recreational drug use?", type: "radio", options: DRUG_FREQ },
      {
        name: "life_changes",
        label: "What significant life changes or stressful events have you experienced recently? (e.g. loss of job, death in the family, divorce)",
        type: "textarea",
      },
    ],
  },
  {
    id: "family-history",
    title: "Family Mental Health History",
    fields: [
      {
        name: "family_history",
        label: "Has any family member had a history of any of the following? (Select all that apply)",
        type: "checkboxgroup",
        options: FAMILY_CONDITIONS,
      },
      {
        name: "family_history_members",
        label: "For those selected above, list the family member's relationship to you (e.g. father, aunt) and the condition",
        type: "textarea",
        showIf: { field: "family_history", notEmpty: true },
      },
    ],
  },
  {
    id: "additional",
    title: "Additional Information",
    fields: [
      { name: "employed", label: "Are you currently employed?", type: "radio", options: YES_NO },
      { name: "occupation", label: "What type of work do you do?", type: "text", showIf: { field: "employed", equals: "Yes" } },
      { name: "enjoy_work", label: "Do you enjoy your work?", type: "text", showIf: { field: "employed", equals: "Yes" } },
      { name: "work_stress", label: "Is there anything stressful about your current work?", type: "textarea", showIf: { field: "employed", equals: "Yes" } },
      { name: "job_safety", label: "How safe do you feel in your job?", type: "text", showIf: { field: "employed", equals: "Yes" } },
      { name: "religious", label: "Do you consider yourself to be spiritual or religious?", type: "radio", options: YES_NO },
      { name: "denomination", label: "To what denomination do you belong?", type: "text", showIf: { field: "religious", equals: "Yes" } },
      {
        name: "relationship_with_god",
        label: "How would you describe your relationship with God?",
        type: "textarea",
        showIf: { field: "religious", equals: "Yes" },
      },
      { name: "strengths", label: "What do you consider to be some of your strengths?", type: "textarea" },
      { name: "weaknesses", label: "What do you consider to be some of your weaknesses?", type: "textarea" },
      { name: "therapy_goals", label: "What would you like to accomplish out of your time in therapy?", type: "textarea" },
      { name: "first_sign_helped", label: "What would be the first sign you notice that tells you that you are being helped?", type: "textarea" },
    ],
  },
];

// =============================================================================
// COUPLES INTAKE  (from "Intake Form for Couples")
// Single-person version: EACH partner completes their own copy. The two copies
// are tied together by a shared couple link the clinician generates.
// =============================================================================
export const COUPLES_INTAKE: FormSection[] = [
  {
    id: "couple-personal",
    title: "Your Information",
    description:
      "Each partner completes their own copy of this form. Information provided is protected as confidential information.",
    fields: [
      { name: "full_name", label: "Your name", type: "text", required: true },
      { name: "partner_name", label: "Your partner's name", type: "text", required: true },
      { name: "dob", label: "Date of birth", type: "date" },
      { name: "address", label: "Address", type: "textarea" },
      { name: "cell_phone", label: "Cell phone", type: "tel", required: true },
      { name: "email", label: "Email", type: "email", help: EMAIL_NOTE },
      { name: "marital_status", label: "Marital status", type: "radio", options: MARITAL },
      { name: "married_how_long", label: "How long have you been married?", type: "text", showIf: { field: "marital_status", equals: "Married" } },
      { name: "relationship_length", label: "How long have you been together?", type: "text" },
      { name: "has_children", label: "Do you have any children?", type: "radio", options: YES_NO },
      { name: "children_detail", label: "If yes: how many within the marriage / outside?", type: "text", showIf: { field: "has_children", equals: "Yes" } },
    ],
  },
  {
    id: "couple-reasons",
    title: "Reasons for Seeking Counseling",
    fields: [
      {
        name: "reasons_for_help",
        label: "What is the reason you are seeking counseling? (symptoms, behaviors, onset, duration, severity)",
        type: "textarea",
        required: true,
        help: "If you are in crisis, call 911 or go to your nearest emergency room - this form is not monitored in real time.",
      },
      { name: "impact", label: "How are these problems affecting you? (self-care, home, school/work, community)", type: "textarea" },
      { name: "onset", label: "When did you first notice the change and what may have caused it?", type: "textarea" },
      { name: "factors", label: "What factors may be contributing to or sustaining the change? (e.g. ethnicity, religion, sexual orientation, socioeconomic status, environment, family practices)", type: "textarea" },
    ],
  },
  {
    id: "couple-history",
    title: "History",
    fields: [
      { name: "prior_therapy", label: "Have you previously received marital/couples/family therapy or mental health services?", type: "radio", options: YES_NO },
      { name: "previous_therapist", label: "Who was your previous therapist/practitioner?", type: "text", showIf: { field: "prior_therapy", equals: "Yes" } },
      { name: "current_meds", label: "Are you currently taking any prescription medication?", type: "radio", options: YES_NO },
      { name: "current_meds_list", label: "Please list (name, dosage, date)", type: "textarea", showIf: { field: "current_meds", equals: "Yes" } },
      { name: "psych_meds_ever", label: "Have you ever been prescribed psychiatric medication?", type: "radio", options: YES_NO },
      { name: "psych_meds_list", label: "Please list (name, dosage, dates)", type: "textarea", showIf: { field: "psych_meds_ever", equals: "Yes" } },
    ],
  },
  {
    id: "couple-general-health",
    title: "General and Mental Health Information",
    fields: [
      { name: "physical_health_rating", label: "How would you rate your current physical health?", type: "radio", options: HEALTH_RATING },
      { name: "health_problems", label: "Please list any specific health problems you are currently experiencing", type: "textarea" },
      { name: "sleep_rating", label: "How would you rate your current sleeping habits?", type: "radio", options: HEALTH_RATING },
      { name: "exercise", label: "How many times per week do you generally exercise, and what types?", type: "text" },
      { name: "appetite_problems", label: "Please list any difficulties with your appetite or eating", type: "textarea" },
      { name: "depression", label: "Are you currently experiencing overwhelming sadness, grief, or depression?", type: "radio", options: YES_NO },
      { name: "anxiety", label: "Are you currently experiencing anxiety, panic attacks, or any phobias?", type: "radio", options: YES_NO },
      { name: "chronic_pain", label: "Are you currently experiencing any chronic pain?", type: "radio", options: YES_NO },
      { name: "alcohol", label: "Do you drink alcohol?", type: "radio", options: YES_NO },
      { name: "drug_use_freq", label: "How often do you engage in recreational drug use?", type: "radio", options: DRUG_FREQ },
      { name: "other_relationship", label: "Are you currently in a romantic relationship other than your marriage?", type: "radio", options: YES_NO },
      { name: "life_changes", label: "What significant life changes or stressful events have you or your spouse experienced recently?", type: "textarea" },
    ],
  },
  {
    id: "couple-family-history",
    title: "Family Mental Health History",
    fields: [
      {
        name: "family_history",
        label: "Is there a family history of any of the following? (Select all that apply)",
        type: "checkboxgroup",
        options: FAMILY_CONDITIONS,
      },
      {
        name: "family_history_members",
        label: "For those selected, list the family member(s) and condition",
        type: "textarea",
        showIf: { field: "family_history", notEmpty: true },
      },
    ],
  },
  {
    id: "couple-additional",
    title: "Additional Information",
    fields: [
      { name: "employed", label: "Are you currently employed / in school?", type: "radio", options: YES_NO },
      { name: "occupation", label: "What is your occupation?", type: "text", showIf: { field: "employed", equals: "Yes" } },
      { name: "work_stress", label: "Is there anything stressful about your current work?", type: "textarea", showIf: { field: "employed", equals: "Yes" } },
      { name: "religious", label: "Do you consider yourself to be spiritual or religious?", type: "radio", options: YES_NO },
      { name: "denomination", label: "To what denomination do you belong?", type: "text", showIf: { field: "religious", equals: "Yes" } },
      { name: "strengths", label: "What do you consider to be some of your strengths?", type: "textarea" },
      { name: "weaknesses", label: "What do you consider to be some of your weaknesses?", type: "textarea" },
      { name: "therapy_goals", label: "What would you like to accomplish out of your time in therapy? (your goals)", type: "textarea" },
      { name: "support_systems", label: "What support systems do you have? (family, friends, church, etc.)", type: "textarea" },
      { name: "first_sign_helped", label: "What would be the first sign that tells you that you are being helped?", type: "textarea" },
    ],
  },
];

// =============================================================================
// Shared: Health Insurance Information and Consent
// =============================================================================
function INSURANCE_SECTION(): FormSection {
  const usingInsurance: FieldCondition = { field: "use_insurance", equals: "Yes" };
  // Client is using insurance AND is not the policy holder → ask for the holder's details.
  const notPolicyHolder: FieldCondition[] = [
    { field: "use_insurance", equals: "Yes" },
    { field: "is_policy_holder", equals: "No" },
  ];
  return {
    id: "insurance",
    title: "Health Insurance Information and Consent",
    fields: [
      {
        name: "use_insurance",
        label: "Do you intend to use your health insurance benefits as part payment for services provided by TIFEC?",
        type: "radio",
        options: YES_NO,
      },
      {
        name: "insurance_consent",
        label:
          "I grant TIFEC permission to release information required to process my insurance claims to Premier Billing Services and to my insurance provider. I understand I may revoke this consent at any time and that I am solely responsible for any portion of my bills not covered by insurance.",
        type: "checkbox",
        showIf: usingInsurance,
      },
      {
        name: "is_policy_holder",
        label: "Are you the policy holder for this insurance?",
        type: "radio",
        options: YES_NO,
        showIf: usingInsurance,
      },
      // Policy holder's details - only asked when the client is NOT the policy holder.
      { name: "policy_holder_name", label: "Policy holder's full name", type: "text", showIf: notPolicyHolder },
      { name: "policy_holder_relationship", label: "Policy holder's relationship to you", type: "text", showIf: notPolicyHolder },
      { name: "policy_holder_dob", label: "Policy holder's date of birth", type: "date", showIf: notPolicyHolder },
      { name: "insured_address", label: "Policy holder's mailing address", type: "textarea", showIf: notPolicyHolder },
      // Plan details - needed whether or not the client is the policy holder.
      { name: "insurance_company", label: "Insurance company name", type: "text", showIf: usingInsurance },
      { name: "insurance_policy_id", label: "Insurance policy ID number", type: "text", showIf: usingInsurance },
    ],
  };
}

// =============================================================================
// Informed Consent for Psychotherapy  (appended to every form)
// =============================================================================
export const INFORMED_CONSENT: FormSection = {
  id: "informed-consent",
  title: "Informed Consent for Psychotherapy",
  description: "Please read carefully. Your agreement below represents an agreement between you and your clinician.",
  intro: [
    "GENERAL INFORMATION - Welcome to the practice. This document contains important information about professional services and business policies. Please read it carefully and note any questions so we can discuss them at our next meeting. When you sign this document, it will represent an agreement between us.",
    "THE THERAPEUTIC PROCESS - Psychotherapy varies depending on the personalities of the psychologist and patient and the particular problems you hope to address. It calls for a very active effort on your part; for therapy to be most successful you will work on things we discuss both during sessions and at home. Therapy can have benefits and risks. Because it often involves discussing unpleasant aspects of your life, you may experience uncomfortable feelings such as sadness, guilt, anger, frustration, loneliness, and helplessness. It has also been shown to have benefits - better relationships, solutions to specific problems, and reductions in distress - but there are no guarantees.",
    "Our first few sessions will involve an evaluation of your needs. By the end of the evaluation I will offer first impressions of what our work will include and a treatment plan, if you decide to continue. If I believe I am not the right therapist for you, I will provide referrals to other practitioners better suited to help you.",
    "OUR SESSIONS - I normally conduct an evaluation lasting 2 to 4 sessions. If we agree to begin psychotherapy, I will usually schedule one 45-minute session per week at an agreed time, although some sessions may be longer or more frequent. Once an appointment hour is scheduled, you will be expected to pay for it unless you provide 24-hour advance notice of cancellation.",
    "CONFIDENTIALITY - In general, the privacy of all communications between a patient and a psychologist is protected by law, and I can only release information about our work with your written permission. There are a few exceptions. In some legal proceedings a judge may order my testimony. There are situations in which I am legally obligated to act to protect others from harm, even if I must reveal information: (1) if you threaten or attempt suicide or conduct yourself such that there is a substantial risk of serious bodily harm to yourself; (2) if I believe a child, elderly, or disabled person is being or has been abused; (3) if I have reasonable suspicion of neglect of those parties; (4) if I believe a patient is threatening serious bodily harm to another, I am required to take protective action, which may include notifying the potential victim, contacting police, or seeking hospitalization.",
    "I may occasionally consult other professionals about your case, making every effort to avoid revealing your identity; consultants are also legally bound to confidentiality. If I am sued, it may be necessary to disclose limited information for my defense. If we see each other accidentally outside the office, I will not acknowledge you first to protect your privacy; if you acknowledge me first I will happily speak briefly with you.",
    "DATA PROTECTION (Cayman Islands Data Protection Act, 2021) - The information you provide here is sensitive personal data. It is encrypted and stored securely and used only to provide and administer your care. We use trusted cloud service providers that may store or process data outside the Cayman Islands under appropriate contractual safeguards. We keep your information only as long as necessary for your care and our legal obligations. You have the right to request access to, or correction of, your personal data, and to ask questions about how it is handled.",
  ],
  fields: [
    {
      name: "consent_agree",
      label:
        "I have read the information in this Informed Consent for Psychotherapy and agree to abide by its terms during our professional relationship.",
      type: "checkbox",
      required: true,
    },
    {
      name: "data_consent",
      label:
        "I consent to TIFEC collecting, encrypting, and securely storing my responses electronically (including via cloud providers that may be located outside the Cayman Islands) for the purpose of my care, in line with the Data Protection Act (2021).",
      type: "checkbox",
      required: true,
    },
    {
      name: "consent_signature_name",
      label: "Type your full name as your electronic signature",
      type: "text",
      required: true,
    },
    {
      name: "guardian_signature_name",
      label: "Legal Guardian's full name (electronic signature)",
      type: "text",
      // Shown only for clients under 18 (couples/DSM have no `dob`, so it stays hidden there).
      showIf: { field: "dob", ageUnder: 18 },
    },
  ],
};

// =============================================================================
// DSM-5-TR Self-Rated Level 1 Cross-Cutting Symptom Measure - Adult
// -----------------------------------------------------------------------------
// © 2013 American Psychiatric Association. Reproduced for clinician use with
// their patients. The 23 items and 0-4 scale are verbatim and MUST NOT be
// modified (APA terms). A repeatable screening measure - no consent/insurance.
// =============================================================================
const DSM_SCALE = [
  "0 - None (not at all)",
  "1 - Slight (rare, less than a day or two)",
  "2 - Mild (several days)",
  "3 - Moderate (more than half the days)",
  "4 - Severe (nearly every day)",
];

function dsmItem(n: number, text: string, examples?: string): FormField {
  return {
    name: `dsm_q${n}`,
    label: `${n}. ${text}`,
    type: "radio",
    options: DSM_SCALE,
    required: true,
    stack: true,
    ...(examples ? { examples } : {}),
  };
}

export const DSM_LEVEL1_ADULT: FormSection[] = [
  {
    id: "dsm-client-info",
    title: "Client Information",
    fields: [
      { name: "full_name", label: "Name", type: "text", required: true },
      { name: "dob", label: "Date of birth", type: "date", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      {
        name: "is_informant",
        label: "Are you completing this form on behalf of someone else?",
        type: "radio",
        options: YES_NO,
        required: true,
        help: "Choose “Yes” only if you are filling this out on behalf of the client (as an informant).",
      },
      {
        name: "informant_relationship",
        label: "What is your relationship to the client?",
        type: "text",
        showIf: { field: "is_informant", equals: "Yes" },
      },
      {
        name: "informant_hours",
        label: "In a typical week, about how many hours do you spend with them?",
        type: "text",
        showIf: { field: "is_informant", equals: "Yes" },
      },
    ],
  },
  {
    id: "dsm-symptoms",
    title: "During the past TWO (2) WEEKS, how much (or how often) have you been bothered by…",
    titleBelowIntro: true,
    intro: [
      "The questions below ask about things that might have bothered you. For each question, select the response that best describes how much (or how often) you have been bothered by each problem during the past TWO (2) WEEKS.",
      "If you are in crisis or thinking about hurting yourself, call 911 or go to your nearest emergency room - this form is not monitored in real time.",
    ],
    fields: [
      dsmItem(1, "Little interest or pleasure in doing things?"),
      dsmItem(2, "Feeling down, depressed, or hopeless?"),
      dsmItem(3, "Feeling more irritated, grouchy, or angry than usual?"),
      dsmItem(4, "Sleeping less than usual, but still have a lot of energy?"),
      dsmItem(5, "Starting lots more projects than usual or doing more risky things than usual?"),
      dsmItem(6, "Feeling nervous, anxious, frightened, worried, or on edge?"),
      dsmItem(7, "Feeling panic or being frightened?"),
      dsmItem(8, "Avoiding situations that make you anxious?"),
      dsmItem(9, "Unexplained aches and pains (e.g., head, back, joints, abdomen, legs)?"),
      dsmItem(10, "Feeling that your illnesses are not being taken seriously enough?"),
      dsmItem(11, "Thoughts of actually hurting yourself?"),
      dsmItem(12, "Hearing things other people couldn't hear, such as voices even when no one was around?"),
      dsmItem(13, "Feeling that someone could hear your thoughts, or that you could hear what another person was thinking?"),
      dsmItem(14, "Problems with sleep that affected your sleep quality over all?"),
      dsmItem(15, "Problems with memory (e.g., learning new information) or with location (e.g., finding your way home)?"),
      dsmItem(16, "Unpleasant thoughts, urges, or images that repeatedly enter your mind?"),
      dsmItem(17, "Feeling driven to perform certain behaviors or mental acts over and over again?"),
      dsmItem(18, "Feeling detached or distant from yourself, your body, your physical surroundings, or your memories?"),
      dsmItem(19, "Not knowing who you really are or what you want out of life?"),
      dsmItem(20, "Not feeling close to other people or enjoying your relationships with them?"),
      dsmItem(21, "Drinking at least 4 drinks of any kind of alcohol in a single day?"),
      dsmItem(22, "Smoking any cigarettes, a cigar, or pipe, or using snuff or chewing tobacco?"),
      dsmItem(
        23,
        "Using any of the following medicines ON YOUR OWN, that is, without a doctor's prescription, in greater amounts or longer than prescribed?",
        "e.g., painkillers (like Vicodin), stimulants (like Ritalin or Adderall), sedatives or tranquilizers (like sleeping pills or Valium), or drugs like marijuana, cocaine or crack, club drugs (like ecstasy), hallucinogens (like LSD), heroin, inhalants or solvents (like glue), or methamphetamine (like speed)"
      ),
    ],
  },
];

// =============================================================================
// DSM-5-TR Parent/Guardian-Rated Level 1 Cross-Cutting Symptom Measure - Child 6-17
// -----------------------------------------------------------------------------
// © 2013 American Psychiatric Association. Verbatim, reproduced for clinician use
// with their patients; MUST NOT be modified (APA terms). Items 1-19 use the 0-4
// scale; items 20-25 are Yes/No/Don't Know. Field names cq1..cq25.
// =============================================================================
const YES_NO_DK = ["Yes", "No", "Don't Know"];

function childItem(n: number, text: string): FormField {
  return { name: `cq${n}`, label: `${n}. ${text}`, type: "radio", options: DSM_SCALE, required: true, stack: true };
}
function childYesNo(n: number, text: string): FormField {
  return { name: `cq${n}`, label: `${n}. ${text}`, type: "radio", options: YES_NO_DK, required: true };
}

// ---- DSM-5-TR Self-Rated Level 1, Child Age 11-17 (completed by the young person) ----
// © 2013 American Psychiatric Association. Reproduced for clinician use with their
// patients; the 25 items and scales are verbatim and MUST NOT be modified.
const SELF_YES_NO = ["Yes", "No"];
function selfItem(n: number, text: string): FormField {
  return { name: `sq${n}`, label: `${n}. ${text}`, type: "radio", options: DSM_SCALE, required: true, stack: true };
}
function selfYesNo(n: number, text: string): FormField {
  return { name: `sq${n}`, label: `${n}. ${text}`, type: "radio", options: SELF_YES_NO, required: true };
}

export const DSM_CHILD_SELF: FormSection[] = [
  {
    id: "childself-info",
    title: "Your Information",
    fields: [
      { name: "full_name", label: "Your name", type: "text", required: true },
      { name: "dob", label: "Your date of birth", type: "date", required: true },
      { name: "email", label: "Email (yours or a parent's)", type: "email", required: true },
    ],
  },
  {
    id: "childself-symptoms",
    title: "During the past TWO (2) WEEKS, how much (or how often) have you…",
    titleBelowIntro: true,
    intro: [
      "The questions below ask about things that might have bothered you. For each question, choose the answer that best describes how much (or how often) you have been bothered by each problem during the past TWO (2) WEEKS.",
      "If you are thinking about hurting yourself, please tell an adult you trust, call 911, or go to your nearest emergency room. This form is not monitored in real time.",
    ],
    fields: [
      selfItem(1, "Been bothered by stomachaches, headaches, or other aches and pains?"),
      selfItem(2, "Worried about your health or about getting sick?"),
      selfItem(3, "Been bothered by not being able to fall asleep or stay asleep, or by waking up too early?"),
      selfItem(4, "Been bothered by not being able to pay attention when you were in class or doing homework or reading a book or playing a game?"),
      selfItem(5, "Had less fun doing things than you used to?"),
      selfItem(6, "Felt sad or depressed for several hours?"),
      selfItem(7, "Felt more irritated or easily annoyed than usual?"),
      selfItem(8, "Felt angry or lost your temper?"),
      selfItem(9, "Started lots more projects than usual or done more risky things than usual?"),
      selfItem(10, "Slept less than usual but still had a lot of energy?"),
      selfItem(11, "Felt nervous, anxious, or scared?"),
      selfItem(12, "Not been able to stop worrying?"),
      selfItem(13, "Not been able to do things you wanted to or should have done, because they made you feel nervous?"),
      selfItem(14, "Heard voices - when there was no one there - speaking about you or telling you what to do or saying bad things to you?"),
      selfItem(15, "Had visions when you were completely awake - that is, seen something or someone that no one else could see?"),
      selfItem(16, "Had thoughts that kept coming into your mind that you would do something bad or that something bad would happen to you or to someone else?"),
      selfItem(17, "Felt the need to check on certain things over and over again, like whether a door was locked or whether the stove was turned off?"),
      selfItem(18, "Worried a lot about things you touched being dirty or having germs or being poisoned?"),
      selfItem(19, "Felt you had to do things in a certain way, like counting or saying special things, to keep something bad from happening?"),
      { name: "sq_gap", label: "In the past TWO (2) WEEKS, have you…", type: "statement" },
      selfYesNo(20, "Had an alcoholic beverage (beer, wine, liquor, etc.)?"),
      selfYesNo(21, "Smoked a cigarette, a cigar, or pipe, or used snuff or chewing tobacco?"),
      selfYesNo(22, "Used drugs like marijuana, cocaine or crack, club drugs (like Ecstasy), hallucinogens (like LSD), heroin, inhalants or solvents (like glue), or methamphetamine (like speed)?"),
      selfYesNo(23, "Used any medicine without a doctor's prescription to get high or change the way you feel (e.g., painkillers [like Vicodin], stimulants [like Ritalin or Adderall], sedatives or tranquilizers [like sleeping pills or Valium], or steroids)?"),
      selfYesNo(24, "In the last 2 weeks, have you thought about killing yourself or committing suicide?"),
      selfYesNo(25, "Have you EVER tried to kill yourself?"),
    ],
  },
];

export const DSM_CHILD_LEVEL1: FormSection[] = [
  {
    id: "child-info",
    title: "Child Information",
    fields: [
      { name: "full_name", label: "Child's name", type: "text", required: true },
      { name: "dob", label: "Child's date of birth", type: "date", required: true },
      { name: "respondent_relationship", label: "Your relationship to the child", type: "text", required: true },
      { name: "email", label: "Your email", type: "email", required: true },
    ],
  },
  {
    id: "child-symptoms",
    title: "During the past TWO (2) WEEKS, how much (or how often) has your child…",
    titleBelowIntro: true,
    intro: [
      "The questions below ask about things that might have bothered your child. For each question, select the response that best describes how much (or how often) your child has been bothered by each problem during the past TWO (2) WEEKS.",
      "If your child is in crisis or thinking about hurting themselves, call 911 or go to your nearest emergency room - this form is not monitored in real time.",
    ],
    fields: [
      childItem(1, "Complained of stomachaches, headaches, or other aches and pains?"),
      childItem(2, "Said he/she was worried about his/her health or about getting sick?"),
      childItem(3, "Had problems sleeping - trouble falling asleep, staying asleep, or waking up too early?"),
      childItem(4, "Had problems paying attention when he/she was in class or doing his/her homework or reading a book or playing a game?"),
      childItem(5, "Had less fun doing things than he/she used to?"),
      childItem(6, "Seemed sad or depressed for several hours?"),
      childItem(7, "Seemed more irritated or easily annoyed than usual?"),
      childItem(8, "Seemed angry or lost his/her temper?"),
      childItem(9, "Started lots more projects than usual or did more risky things than usual?"),
      childItem(10, "Slept less than usual for him/her, but still had lots of energy?"),
      childItem(11, "Said he/she felt nervous, anxious, or scared?"),
      childItem(12, "Not been able to stop worrying?"),
      childItem(13, "Said he/she couldn't do things he/she wanted to or should have done, because they made him/her feel nervous?"),
      childItem(14, "Said that he/she heard voices - when there was no one there - speaking about him/her or telling him/her what to do or saying bad things to him/her?"),
      childItem(15, "Said that he/she had a vision when he/she was completely awake - saw something or someone that no one else could see?"),
      childItem(16, "Said that he/she had thoughts that kept coming into his/her mind that he/she would do something bad, or that something bad would happen to him/her or to someone else?"),
      childItem(17, "Said he/she felt the need to check on certain things over and over again, like whether a door was locked or whether the stove was turned off?"),
      childItem(18, "Seemed to worry a lot about things he/she touched being dirty or having germs or being poisoned?"),
      childItem(19, "Said that he/she had to do things in a certain way, like counting or saying special things out loud, in order to keep something bad from happening?"),
      { name: "_child_substance_intro", type: "statement", label: "In the past TWO (2) WEEKS, has your child…" },
      childYesNo(20, "Had an alcoholic beverage (beer, wine, liquor, etc.)?"),
      childYesNo(21, "Smoked a cigarette, a cigar, or pipe, or used snuff or chewing tobacco?"),
      childYesNo(22, "Used drugs like marijuana, cocaine or crack, club drugs (like ecstasy), hallucinogens (like LSD), heroin, inhalants or solvents (like glue), or methamphetamine (like speed)?"),
      childYesNo(23, "Used any medicine without a doctor's prescription (e.g., painkillers [like Vicodin], stimulants [like Ritalin or Adderall], sedatives or tranquilizers [like sleeping pills or Valium], or steroids)?"),
      childYesNo(24, "Talked about wanting to kill himself/herself or about wanting to commit suicide?"),
      childYesNo(25, "Has he/she EVER tried to kill himself/herself?"),
    ],
  },
];

// =============================================================================
// Form registry
// -----------------------------------------------------------------------------
// Add a new intake form here: give it a key + label + body sections, then add
// the key to the relevant clinicians' `forms` list in lib/clinicians.ts.
// `appendInsurance` / `appendConsent` control the shared trailing sections.
// =============================================================================
// =============================================================================
// Psychoeducational Assessment Intake (child / teen, completed by a parent or
// guardian). Digitized from the practice's paper "Intake Form".
// =============================================================================
const MARITAL_PE = ["Married", "Married before", "Never Married", "Separated", "Domestic Partnership", "Widowed"];
const HEALTH_PE = ["Very good", "Good", "Satisfactory", "Unsatisfactory", "Poor"];

/** Guardian block, generated for mother and father so the two stay identical. */
function guardianSection(who: "mother" | "father"): FormSection {
  const p = who;
  const Title = who === "mother" ? "Mother / Legal Guardian" : "Father / Legal Guardian";
  return {
    id: `psychoed-${p}`,
    title: Title,
    fields: [
      { name: `${p}_name`, label: `Name of ${who} / legal guardian`, type: "text" },
      { name: `${p}_address`, label: "Home address", type: "textarea" },
      { name: `${p}_dob`, label: "Date of birth", type: "date" },
      { name: `${p}_email`, label: "Email", type: "email" },
      { name: `${p}_home_phone`, label: "Telephone (home/cell)", type: "tel" },
      { name: `${p}_work_phone`, label: "Telephone (work/cell)", type: "tel" },
      { name: `${p}_marital_status`, label: "Marital status", type: "radio", options: MARITAL_PE },
      {
        name: `${p}_marital_detail`,
        label: "If separated, in a domestic partnership, or widowed: how many years? If married before: how many times?",
        type: "text",
      },
      { name: `${p}_employer`, label: "Employer", type: "text" },
      { name: `${p}_work_address`, label: "Work address", type: "textarea" },
      { name: `${p}_occupation`, label: "Occupation", type: "text" },
      { name: `${p}_employed_length`, label: "How long employed?", type: "text" },
      { name: `${p}_num_children`, label: "Number of children", type: "number" },
      { name: `${p}_birth_position`, label: "Birth position of client", type: "text" },
    ],
  };
}

export const PSYCHOED_INTAKE: FormSection[] = [
  {
    id: "psychoed-client",
    title: "Identifying Information",
    intro: [
      "Kindly share your identifying information, family history and current events. This will provide useful information for the client's psychological assessment and treatment.",
    ],
    fields: [
      { name: "full_name", label: "Full name of client", type: "text", required: true },
      { name: "address", label: "Home address", type: "textarea" },
      { name: "dob", label: "Date of birth", type: "date", required: true },
      { name: "gender", label: "Gender", type: "text" },
      { name: "home_phone", label: "Telephone (home/cell)", type: "tel" },
      { name: "work_phone", label: "Telephone (work/cell)", type: "tel" },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "language_home", label: "Language spoken at home", type: "text" },
      { name: "school_work", label: "School / work", type: "text" },
      { name: "grade", label: "Grade", type: "text" },
      { name: "teacher_child_ratio", label: "Teacher/child ratio", type: "text" },
      {
        name: "referred_by",
        label: "Who referred you for a psychoeducational assessment?",
        type: "text",
        help: "Please specify name, address, and relationship.",
      },
      { name: "referral_reason", label: "Reason for referral", type: "textarea" },
    ],
  },
  guardianSection("mother"),
  guardianSection("father"),
  {
    id: "psychoed-siblings",
    title: "Siblings",
    fields: [
      { name: "siblings_total", label: "Total number of siblings", type: "number" },
      { name: "sibling_1", label: "Sibling 1 (name, age, school/work)", type: "text" },
      { name: "sibling_2", label: "Sibling 2 (name, age, school/work)", type: "text" },
      { name: "sibling_3", label: "Sibling 3 (name, age, school/work)", type: "text" },
      { name: "sibling_4", label: "Sibling 4 (name, age, school/work)", type: "text" },
      { name: "sibling_5", label: "Sibling 5 (name, age, school/work)", type: "text" },
      { name: "sibling_6", label: "Sibling 6 (name, age, school/work)", type: "text" },
    ],
  },
  {
    id: "psychoed-medical",
    title: "Medical History",
    fields: [
      { name: "height", label: "Client's height", type: "text", placeholder: "e.g. 5 ft 2 in" },
      { name: "weight", label: "Client's weight (lbs)", type: "text" },
      { name: "hand_preference", label: "Hand preference", type: "radio", options: ["Left", "Right"] },
      { name: "mh_treated", label: "Is the client currently being treated for (or have a history of) a mental health challenge?", type: "radio", options: YES_NO },
      { name: "mh_detail", label: "If yes, please describe", type: "text", showIf: { field: "mh_treated", equals: "Yes" } },
      { name: "previous_therapist", label: "Who was the previous therapist/clinician?", type: "text", showIf: { field: "mh_treated", equals: "Yes" } },
      { name: "prior_psychoed", label: "Has the client previously done a psychoeducational assessment?", type: "radio", options: YES_NO },
      { name: "previous_diagnosis", label: "Previous diagnosis", type: "text", showIf: { field: "prior_psychoed", equals: "Yes" } },
      { name: "previous_psychologist", label: "Who was the previous psychologist/clinician?", type: "text", showIf: { field: "prior_psychoed", equals: "Yes" } },
      { name: "current_diagnosis", label: "Current diagnosis (if applicable)", type: "text" },
      { name: "current_meds", label: "Is the client currently taking any medications?", type: "radio", options: YES_NO },
      { name: "current_meds_list", label: "If yes, please list", type: "textarea", showIf: { field: "current_meds", equals: "Yes" } },
      { name: "physician_name", label: "Name of physician", type: "text" },
      { name: "short_term_meds", label: "Has the client been treated with any short-term medication, over-the-counter medication, or supplements?", type: "radio", options: YES_NO },
      { name: "short_term_meds_list", label: "If yes, please list", type: "textarea", showIf: { field: "short_term_meds", equals: "Yes" } },
      { name: "medication_reason", label: "Reason for medication", type: "text" },
      { name: "substance_history", label: "Does the client have a history of alcohol use, recreational drug use or drug dependency?", type: "radio", options: YES_NO },
      { name: "substance_list", label: "If yes, please list what has recently been used or is currently being used", type: "text", showIf: { field: "substance_history", equals: "Yes" } },
      { name: "smoking", label: "Does the client currently smoke cigarettes, use tobacco products, or vape?", type: "radio", options: YES_NO },
      { name: "smoking_amount", label: "If yes, how many packs per day, or vape pods daily?", type: "text", showIf: { field: "smoking", equals: "Yes" } },
      { name: "physical_health_rating", label: "How would you rate the client's current physical health?", type: "radio", options: HEALTH_PE },
      {
        name: "conditions",
        label: "Does the client have any of the following conditions?",
        type: "checkboxgroup",
        options: [
          "Allergies",
          "Respiratory problems (asthma etc.)",
          "Constant headache",
          "Low energy / tiredness",
          "High energy",
          "Behavioural challenge",
          "High / Low blood pressure",
          "Heart problems",
          "Diabetes",
          "Under / Over active thyroid",
          "Other",
        ],
      },
      { name: "conditions_other", label: "If other, please describe", type: "text", showIf: { field: "conditions", includes: "Other" } },
    ],
  },
  {
    id: "psychoed-life-events",
    title: "Current Life Events",
    fields: [
      {
        name: "life_events",
        label: "Have there been any recent changes in the client's life?",
        type: "checkboxgroup",
        options: [
          "Divorce (parents)",
          "Remarriage (parents)",
          "Loss of family member",
          "Loss of pet",
          "Court / family services",
          "Change or loss of teacher, or member of school family",
          "Other",
        ],
      },
      { name: "life_events_other", label: "If other, please list", type: "text", showIf: { field: "life_events", includes: "Other" } },
    ],
  },
  {
    id: "psychoed-behaviour",
    title: "Description of the Client's Behaviour",
    intro: ["Task-oriented behaviour. Tick every description that applies to your child or teen."],
    fields: [
      {
        name: "behaviour_strengths",
        label: "Task-oriented behaviour (strengths)",
        type: "checkboxgroup",
        options: [
          "Active: always busy with something",
          "Ambitious: strongly wants to succeed",
          "Cautious: being very careful",
          "Conscientious: taking time to do things right",
          "Creative: can make up things easily or think of new things",
          "Curious: always wanting to know things",
          "Logical: using clear and sound reasoning",
          "Organized: dealing with one's affairs efficiently",
          "Perfectionist: wants everything to be done right and perfectly",
          "Precise: careful and with great attention to detail",
        ],
      },
      {
        name: "behaviour_challenges",
        label: "Task-oriented behaviour (challenges)",
        type: "checkboxgroup",
        options: [
          "Anxious: worried, uneasy, or nervous",
          "Careless: not being careful; rushing into things",
          "Impatient: quickly irritated and easily provoked",
          "Lazy: unwilling to work or showing a lack of effort",
          "Rigid: unwilling to change one's outlook, belief, or response",
          "Scatterbrained: inattentive and forgetful",
          "Slapdash: performing work quickly and carelessly",
          "Sober: serious, sensible, or solemn",
          "Undisciplined: lacking in discipline",
          "Volatile: changing moods very quickly",
        ],
      },
    ],
  },
  {
    id: "psychoed-relationships",
    title: "Description of the Client's Relationships",
    fields: [
      {
        name: "relationships_strengths",
        label: "Relationships (strengths)",
        type: "checkboxgroup",
        options: [
          "Altruistic: shows selfless concern for others",
          "Caring: desires to help people",
          "Compassionate: feels or shows sympathy or concern for others",
          "Considerate: thinks of others",
          "Faithful: being loyal",
          "Impartial: treats all persons equally; fair and just",
          "Kind: thoughtful, caring",
          "Pleasant: polite",
          "Polite: exhibiting good manners",
          "Sincere: being totally honest",
        ],
      },
      {
        name: "relationships_challenges",
        label: "Relationships (challenges)",
        type: "checkboxgroup",
        options: [
          "Aggressive: verbally or physically threatening",
          "Argumentative: often arguing with people",
          "Bossy: always telling people what to do",
          "Deceitful: doing or saying anything to get people to do what you want",
          "Domineering: constantly trying to control others",
          "Flaky: unstable and unreliable",
          "Inconsiderate: not caring about others or their feelings",
          "Manipulative: always trying to influence other people",
          "Rude: treating people badly; breaking social rules",
          "Spiteful: seeking revenge; hurting others because you didn't get what you want",
        ],
      },
      { name: "relationship_example", label: "Give an example of behaviour in relationships (peers / adults)", type: "textarea" },
    ],
  },
  {
    id: "psychoed-school",
    title: "School History",
    fields: [
      { name: "current_school", label: "Current school", type: "text" },
      { name: "current_class", label: "Current class", type: "text" },
      { name: "date_started", label: "Date started / attended", type: "text" },
      { name: "previous_school", label: "Previous school", type: "text" },
      { name: "previous_school_time", label: "Time there", type: "text" },
      { name: "challenges_current", label: "Challenges in the current learning environment", type: "textarea" },
      { name: "challenges_previous", label: "Challenges in the previous learning environment", type: "textarea" },
      { name: "interventions", label: "Interventions used (if known)", type: "textarea" },
      { name: "observation_notes", label: "Observation notes", type: "textarea" },
    ],
  },
];

// =============================================================================
// Educational psychology forms (Mrs. Sofia Hamilton). The practice's own
// material, digitized from her documents.
// =============================================================================
const PARENT_FREQ = ["0 - Never", "1 - Sometimes", "2 - Often", "3 - Always"];

function selfChoice(n: number, question: string, options: string[]): FormField {
  return { name: `cb${n}`, label: `${n}. ${question}`, type: "radio", options, required: true, stack: true };
}

export const CHILD_BEHAVIOUR_SELF: FormSection[] = [
  {
    id: "cbsa-info",
    title: "About You",
    fields: [
      { name: "full_name", label: "Your name", type: "text", required: true },
      { name: "dob", label: "Your date of birth", type: "date", required: true },
      { name: "email", label: "Email (yours or a parent's)", type: "email", required: true },
    ],
  },
  {
    id: "cbsa-questions",
    title: "How do you feel about…",
    titleBelowIntro: true,
    intro: [
      "We want to learn more about how you feel about your behaviour and actions. Please answer the following questions honestly. Your responses will help us understand how you are doing and how we can support you better.",
      "Read each statement carefully and choose the answer that fits you best. Be honest, there are no right or wrong answers.",
    ],
    fields: [
      selfChoice(1, "How do you feel about following instructions from adults (like your parents, teachers, or caregivers)?", [
        "I always try my best to follow instructions.",
        "I usually follow instructions, but sometimes I forget.",
        "Sometimes I follow instructions, but other times I need reminders.",
        "I have trouble following instructions most of the time.",
      ]),
      selfChoice(2, "How do you feel about finishing your tasks (like homework, chores, or projects)?", [
        "I usually finish my tasks on time.",
        "I finish most of my tasks, but sometimes I need extra time.",
        "I have trouble finishing my tasks on time.",
        "I often struggle to finish my tasks.",
      ]),
      selfChoice(3, "How do you feel about talking to others (like your friends, family, or classmates)?", [
        "I enjoy talking to others and making new friends.",
        "I like talking to others, but sometimes I feel shy.",
        "I feel nervous or shy when talking to others.",
        "I find it hard to talk to others or make friends.",
      ]),
      selfChoice(4, "How do you feel about listening during class or group activities?", [
        "I usually listen well and participate in class.",
        "I try to listen, but sometimes I get distracted.",
        "I have trouble paying attention and listening.",
        "I often get distracted and have trouble focusing.",
      ]),
      selfChoice(5, "How do you feel about controlling your emotions when you are upset or angry?", [
        "I can usually control my emotions and calm down.",
        "I try to control my emotions, but sometimes it is hard.",
        "I have trouble controlling my emotions when I am upset.",
        "I often have trouble calming down when I am upset or angry.",
      ]),
      selfChoice(6, "How do you feel about trying new things or facing challenges?", [
        "I enjoy trying new things and facing challenges.",
        "I am willing to try new things, but sometimes I feel nervous.",
        "I feel nervous or scared when facing challenges.",
        "I often avoid trying new things or facing challenges.",
      ]),
      selfChoice(7, "How do you feel about apologizing when you have made a mistake?", [
        "I am comfortable apologizing and making things right.",
        "I try to apologize when I have made a mistake.",
        "I find it hard to apologize when I have made a mistake.",
        "I struggle to apologize or admit when I have made a mistake.",
      ]),
      selfChoice(8, "How do you feel about helping others when they need it?", [
        "I enjoy helping others and being kind.",
        "I try to help others when I can.",
        "Sometimes I am not sure how to help others.",
        "I have trouble helping others or being kind.",
      ]),
      {
        name: "anything_else",
        label: "Is there anything else you would like to tell us about how you are feeling, or how we can help you?",
        type: "textarea",
      },
    ],
  },
];

export const PARENT_BEHAVIOUR_ASSESSMENT: FormSection[] = [
  {
    id: "pba-info",
    title: "Child's Information",
    fields: [
      { name: "full_name", label: "Child's name", type: "text", required: true },
      { name: "dob", label: "Child's date of birth", type: "date", required: true },
      { name: "respondent_relationship", label: "Your relationship to the child", type: "text", required: true },
      { name: "email", label: "Your email", type: "email", required: true },
    ],
  },
  {
    id: "pba-items",
    title: "How often does each statement apply to your child?",
    titleBelowIntro: true,
    intro: ["Please rate each statement based on how often it applies to your child."],
    fields: [
      { name: "pb1", label: "1. Following instructions: my child follows instructions well from other adults (like teachers or caregivers).", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb2", label: "2. Task completion: my child completes tasks (like assigned work, homework, chores) on time.", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb3", label: "3. Respectful communication: my child uses respectful language and tone when communicating with others (adults and peers).", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb4", label: "4. Focus and attention: my child maintains focus and attention during activities (like assigned work, homework or chores).", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb5", label: "5. Emotional regulation: my child can control their emotions when they get upset or angry.", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb6", label: "6. Social skills: my child gets along well with their peers and other adults.", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb7", label: "7. Problem-solving: my child tries to solve problems on their own before asking for help.", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb8", label: "8. Empathy and kindness: my child shows empathy and kindness towards others.", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb9", label: "9. Independence: my child can do things on their own without always needing help.", type: "radio", options: PARENT_FREQ, required: true },
      { name: "pb10", label: "10. Self-control: my child can control their impulses and actions.", type: "radio", options: PARENT_FREQ, required: true },
      {
        name: "additional_comments",
        label: "Additional comments: is there anything else you would like to share about your child's behaviour or feelings?",
        type: "textarea",
      },
    ],
  },
];

export const EI_CAMP_AGREEMENT: FormSection[] = [
  {
    id: "eic-info",
    title: "Participant Details",
    fields: [
      { name: "full_name", label: "Name of participant", type: "text", required: true },
      { name: "dob", label: "Participant's date of birth", type: "date", required: true },
      { name: "email", label: "Email (participant's or parent's)", type: "email", required: true },
    ],
  },
  {
    id: "eic-rules",
    title: "Agreement to Abide by Camp Guidelines & Rules",
    titleBelowIntro: true,
    intro: [
      "Welcome to the Emotional Intelligence Camp. To ensure a safe, respectful, and productive environment for everyone, we have established the following rules of conduct. It is important that all participants adhere to these rules to create a positive experience for all attendees.",
      "1. RESPECT FOR OTHERS - Always respect the personal space and boundaries of others. Bullying, teasing, or making fun of others will not be tolerated. Listen attentively when someone else is speaking and do not interrupt.",
      "2. RESPECT FOR THE ENVIRONMENT - Keep your surroundings clean and tidy, and dispose of trash properly. Treat camp facilities, equipment, and materials with care; do not damage or deface any property.",
      "3. PARTICIPATION - Full participation in all camp activities is crucial for personal growth and for fostering a supportive environment. I will actively participate in all scheduled activities, including discussions, art and craft projects, and team-building games. I will engage respectfully and thoughtfully with facilitators and fellow participants, and maintain a positive attitude even when activities are challenging or outside my comfort zone. I will respect the camp rules and follow the guidance of the facilitators.",
      "4. COMMUNICATION - Use respectful and appropriate language at all times, avoiding profanity and hurtful comments. Express emotions constructively, using “I” statements to share feelings (for example, “I feel upset when...”).",
      "5. COOPERATION AND TEAMWORK - Work cooperatively with other participants and support each other. Share materials and resources, take turns, and be considerate. Resolve conflicts peacefully and seek help from a facilitator if needed.",
      "6. SAFETY - Engage in safe behaviour and follow all safety guidelines provided by facilitators. Create an emotionally safe environment by being supportive and non-judgmental.",
      "7. ATTENDANCE AND PUNCTUALITY - Arrive on time for all activities. Late arrivals can disrupt the group and cause delays.",
      "8. DRESS CODE - Tops should be long enough to cover the mid-section, with no exposed skin through holes in shirts or jeans. Shirts or blouses should be hip length when wearing leggings or tights. Shorts or skirts should be no more than 2 inches above the knee. For field trips, the Cayman T-shirt should be worn with jeans and tennis shoes.",
      "9. CONFIDENTIALITY AGREEMENT - Personal experiences, feelings and thoughts shared during discussions, personal information about other campers and facilitators, and anything explicitly stated as confidential must remain private. I agree to keep all shared information confidential and will not disclose it outside the camp without explicit permission from the person who shared it. If I become aware of any situation where a participant is at risk of harm to themselves or others, I will immediately inform a camp facilitator or counsellor, who is mandated to report such occurrences.",
      "10. CONSEQUENCES FOR MISCONDUCT - Minor infractions receive a warning and a reminder of the rules. Repeated or serious infractions may result in a time-out period for reflection. Continued misconduct may result in a call to parents or guardians. Severe or ongoing misconduct may lead to dismissal from the camp without refund of payments made.",
    ],
    fields: [
      {
        name: "agree_rules",
        label:
          "I understand and agree to the above terms regarding confidentiality and participation. I acknowledge that my commitment to these terms is essential for creating a safe and supportive environment for everyone at the Emotional Intelligence Camp.",
        type: "checkbox",
        required: true,
      },
      { name: "participant_signature", label: "Participant's full name as an electronic signature", type: "text", required: true },
      {
        name: "guardian_signature",
        label: "Parent or guardian's full name as an electronic signature",
        type: "text",
        help: "Required if the participant is under 18.",
        showIf: { field: "dob", ageUnder: 18 },
      },
    ],
  },
];

export interface FormTemplate {
  key: FormTemplateKey;
  /** Internal name — what clinicians/admin see (dashboard, submissions, oversight). */
  label: string;
  /** Client-facing name — what the client sees at the top of the form. Defaults to `label`. */
  clientLabel?: string;
  /** The body sections (without the shared Insurance/Consent sections). */
  body: FormSection[];
  /** Append the shared Health Insurance section (intake forms). Default false. */
  appendInsurance?: boolean;
  /** Append the Informed Consent for Psychotherapy. Default false. */
  appendConsent?: boolean;
}

// DSM-5-TR Level 2 follow-up measures, generated from their config (lib/level2.ts).
const L2_TEMPLATES = Object.fromEntries(
  LEVEL2_MEASURES.map((m) => [
    m.key,
    {
      key: m.key,
      label: m.label,
      clientLabel: m.tier === "severity" ? "Severity Questionnaire" : "Follow-up Questionnaire",
      body: level2Sections(m),
    } as FormTemplate,
  ])
) as Record<string, FormTemplate>;

export const FORM_TEMPLATES = {
  individual: {
    key: "individual",
    label: "Individual Client Intake", // clinician-facing
    clientLabel: "Intake Form", // client-facing
    body: INDIVIDUAL_INTAKE,
    appendInsurance: true,
    appendConsent: true,
  },
  couples: {
    key: "couples",
    label: "Couples Intake",
    clientLabel: "Couples Intake Form",
    body: COUPLES_INTAKE,
    appendInsurance: true,
    appendConsent: true,
  },
  "dsm5-level1-adult": {
    key: "dsm5-level1-adult",
    label: "DSM-5-TR Level 1 Cross-Cutting Symptom Measure (Adult)",
    clientLabel: "Wellbeing Screening",
    body: DSM_LEVEL1_ADULT,
    // Repeatable screening measure - no consent re-sign, no insurance section.
  },
  "dsm5-level1-child": {
    key: "dsm5-level1-child",
    label: "DSM-5-TR Level 1 (Parent/Guardian of Child 6-17)",
    clientLabel: "Child Wellbeing Screening",
    body: DSM_CHILD_LEVEL1,
    // Parent/guardian-rated screening measure - no consent re-sign, no insurance.
  },
  "dsm5-level1-child-self": {
    key: "dsm5-level1-child-self",
    label: "DSM-5-TR Level 1 (Child Self-Report, 11-17)",
    clientLabel: "Wellbeing Check-In",
    body: DSM_CHILD_SELF,
    // Self-rated screening measure - no consent re-sign, no insurance.
  },
  "psychoed-intake": {
    key: "psychoed-intake",
    label: "Psychoeducational Assessment Intake",
    clientLabel: "Psychoeducational Assessment Intake Form",
    body: PSYCHOED_INTAKE,
    appendConsent: true,
  },
  "child-behaviour-self": {
    key: "child-behaviour-self",
    label: "Child Behaviour Self-Assessment",
    clientLabel: "How Are You Doing?",
    body: CHILD_BEHAVIOUR_SELF,
  },
  "parent-behaviour-assessment": {
    key: "parent-behaviour-assessment",
    label: "Parent Assessment of Child's Behaviour",
    clientLabel: "Parent Assessment of Your Child's Behaviour",
    body: PARENT_BEHAVIOUR_ASSESSMENT,
  },
  "ei-camp-agreement": {
    key: "ei-camp-agreement",
    label: "Emotional Intelligence Camp Rules & Agreement",
    clientLabel: "Emotional Intelligence Camp Agreement",
    body: EI_CAMP_AGREEMENT,
  },
  ...L2_TEMPLATES,
} as Record<FormTemplateKey, FormTemplate>;

/** Internal/clinician-facing name. */
export function templateLabel(key: FormTemplateKey): string {
  return FORM_TEMPLATES[key]?.label ?? key;
}

/** Client-facing name shown on the intake form (falls back to the internal label). */
export function clientLabel(key: FormTemplateKey): string {
  const t = FORM_TEMPLATES[key];
  return t?.clientLabel ?? t?.label ?? key;
}

export function isFormTemplateKey(v: unknown): v is FormTemplateKey {
  return typeof v === "string" && v in FORM_TEMPLATES;
}

// =============================================================================
// Assembly
// =============================================================================
/** Build the full ordered section list: body + clinician extras + (insurance) + (consent). */
export function buildSections(template: FormTemplateKey, extraSections: FormSection[] = []): FormSection[] {
  const tpl = FORM_TEMPLATES[template] ?? FORM_TEMPLATES.individual;
  return [
    ...tpl.body,
    ...extraSections,
    ...(tpl.appendInsurance ? [INSURANCE_SECTION()] : []),
    ...(tpl.appendConsent ? [INFORMED_CONSENT] : []),
  ];
}

/** Whole years between a date-of-birth string and today, or null if unparseable. */
export function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function matchCondition(c: FieldCondition, values: Record<string, string>): boolean {
  const v = values[c.field] ?? "";
  if (c.equals !== undefined) return v === c.equals;
  if (c.in) return c.in.includes(v);
  if (c.includes) return v.split(", ").includes(c.includes);
  if (c.notEmpty) return v.trim() !== "";
  if (c.ageUnder !== undefined) {
    const age = ageFromDob(v);
    return age !== null && age < c.ageUnder;
  }
  return true;
}

/** Whether a field should be shown given the current answers (used client + server). */
export function fieldVisible(field: FormField, values: Record<string, string>): boolean {
  if (!field.showIf) return true;
  const conds = Array.isArray(field.showIf) ? field.showIf : [field.showIf];
  return conds.every((c) => matchCondition(c, values));
}

/** Flat map of field name -> label, for rendering a stored submission. */
export function labelMap(sections: FormSection[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of sections) for (const f of s.fields) map[f.name] = f.label;
  return map;
}
