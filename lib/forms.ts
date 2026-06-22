// =============================================================================
// TIFEC intake form definitions - digitized from the practice's paper forms:
//   • Client Intake Form (individual adult)         -> INDIVIDUAL_INTAKE
//   • Intake Form for Couples (His/Hers)            -> COUPLES_INTAKE
//   • Informed Consent for Psychotherapy            -> INFORMED_CONSENT (appended)
//
// A clinician offers one or more forms (set via `forms` in lib/clinicians.ts),
// may add their own `extraSections`, and the Informed Consent is appended to all.
// =============================================================================

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

export type FormTemplateKey = "individual" | "couples" | "dsm5-level1-adult";

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
      { name: "age", label: "Age", type: "number" },
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
      { name: "age", label: "Age", type: "number" },
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
      { name: "age", label: "Age", type: "number" },
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
// Form registry
// -----------------------------------------------------------------------------
// Add a new intake form here: give it a key + label + body sections, then add
// the key to the relevant clinicians' `forms` list in lib/clinicians.ts.
// `appendInsurance` / `appendConsent` control the shared trailing sections.
// =============================================================================
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

export const FORM_TEMPLATES: Record<FormTemplateKey, FormTemplate> = {
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
};

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
function ageFromDob(dob: string): number | null {
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
