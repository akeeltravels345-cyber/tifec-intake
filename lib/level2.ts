// =============================================================================
// DSM-5-TR Level 2 Cross-Cutting Symptom Measures - Adult
// -----------------------------------------------------------------------------
// The deeper-dive follow-up scales used when a Level 1 domain flags. Eight
// measures, each reproduced verbatim for clinician use with their patients per
// the rights statements in the source PDFs (PROMIS/PHO, NIDA, Elsevier/ASRM,
// Goodman/FOCI, public-domain PHQ-15). Items MUST NOT be modified.
//
// Scoring differs per instrument:
//   - PROMIS (Anxiety/Depression/Anger/Sleep): sum 1-5 ratings -> raw -> T-score
//     via the published conversion table -> severity band.
//   - PHQ-15 (Somatic): sum 0-2 -> Minimal/Low/Medium/High band.
//   - ASRM (Mania): sum 0-4 -> >=6 = positive screen for mania/hypomania.
//   - FOCI (Repetitive thoughts/behaviors): sum 0-4 -> >=8 = consider OCD work-up.
//   - NIDA-ASSIST (Substance): each substance scored independently (any >0 = use).
// All are screening aids, not diagnoses. Item field names: q1..qN.
// =============================================================================

import type { FormSection, FormField } from "./forms";

export interface L2Option {
  label: string;
  value: number;
}
export interface L2Item {
  text: string;
  scale?: L2Option[]; // overrides the measure default scale (Sleep, ASRM, FOCI)
  optional?: boolean; // e.g. PHQ-15 "women only" item
}
export type L2ScoringKind = "promis" | "phq" | "asrm" | "foci" | "substance" | "phq9" | "average";

export interface L2Measure {
  key: string;
  label: string; // full template label
  short: string; // dashboard chip
  icon: string;
  instrument: string; // source instrument name
  domain: string; // Level 2: the Level 1 domain this follows up on. Severity: the disorder.
  window: string; // recall window shown to the client
  instructions: string;
  scale: L2Option[]; // default response scale
  stackItems: boolean; // render options stacked (long anchors) vs. inline
  items: L2Item[];
  scoring: { kind: L2ScoringKind; table?: Record<number, number> };
  /** "level2" = cross-cutting follow-up (default). "severity" = disorder-specific severity measure. */
  tier?: "level2" | "severity";
  /** Extra client-info fields (e.g. the traumatic-event fields on the stress measures). */
  extraInfo?: FormField[];
  /** Optional extra context paragraph shown above the items (e.g. defining "social situations"). */
  intro?: string;
}

// ---- shared scales ----------------------------------------------------------
const opts = (labels: string[]): L2Option[] => labels.map((label, i) => ({ label, value: i }));

const PROMIS: L2Option[] = [
  { label: "Never", value: 1 },
  { label: "Rarely", value: 2 },
  { label: "Sometimes", value: 3 },
  { label: "Often", value: 4 },
  { label: "Always", value: 5 },
];
const PHQ: L2Option[] = [
  { label: "Not bothered at all", value: 0 },
  { label: "Bothered a little", value: 1 },
  { label: "Bothered a lot", value: 2 },
];
const FREQ_2W: L2Option[] = [
  { label: "Not at all", value: 0 },
  { label: "One or two days", value: 1 },
  { label: "Several days", value: 2 },
  { label: "More than half the days", value: 3 },
  { label: "Nearly every day", value: 4 },
];
// Severity-measure scales.
const PHQ4: L2Option[] = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
];
const NEVER_ALL: L2Option[] = [
  { label: "Never", value: 0 },
  { label: "Occasionally", value: 1 },
  { label: "Half of the time", value: 2 },
  { label: "Most of the time", value: 3 },
  { label: "All of the time", value: 4 },
];
const NSESSS: L2Option[] = [
  { label: "Not at all", value: 0 },
  { label: "A little bit", value: 1 },
  { label: "Moderately", value: 2 },
  { label: "Quite a bit", value: 3 },
  { label: "Extremely", value: 4 },
];
const TRAUMA_INFO: FormField[] = [
  { name: "trauma_event", label: "Please list the traumatic event that you experienced", type: "text" },
  { name: "trauma_date", label: "Date of the traumatic event", type: "date" },
];
// Sleep uses three label sets, with items 2/3/7/8 reverse-scored.
const A = ["Not at all", "A little bit", "Somewhat", "Quite a bit", "Very much"];
const N = ["Never", "Rarely", "Sometimes", "Often", "Always"];
const Q = ["Very poor", "Poor", "Fair", "Good", "Very good"];
const fwd = (labels: string[]): L2Option[] => labels.map((label, i) => ({ label, value: i + 1 }));
const rev = (labels: string[]): L2Option[] => labels.map((label, i) => ({ label, value: 5 - i }));

// ---- PROMIS raw -> T-score conversion tables (from the APA PDFs) -------------
const T_ANX: Record<number, number> = { 7: 36.3, 8: 42.1, 9: 44.7, 10: 46.7, 11: 48.4, 12: 49.9, 13: 51.3, 14: 52.6, 15: 53.8, 16: 55.1, 17: 56.3, 18: 57.6, 19: 58.8, 20: 60.0, 21: 61.3, 22: 62.6, 23: 63.8, 24: 65.1, 25: 66.4, 26: 67.7, 27: 68.9, 28: 70.2, 29: 71.5, 30: 72.9, 31: 74.3, 32: 75.8, 33: 77.4, 34: 79.5, 35: 82.7 };
const T_DEP: Record<number, number> = { 8: 37.1, 9: 43.3, 10: 46.2, 11: 48.2, 12: 49.8, 13: 51.2, 14: 52.3, 15: 53.4, 16: 54.3, 17: 55.3, 18: 56.2, 19: 57.1, 20: 57.9, 21: 58.8, 22: 59.7, 23: 60.7, 24: 61.6, 25: 62.5, 26: 63.5, 27: 64.4, 28: 65.4, 29: 66.4, 30: 67.4, 31: 68.3, 32: 69.3, 33: 70.4, 34: 71.4, 35: 72.5, 36: 73.6, 37: 74.8, 38: 76.2, 39: 77.9, 40: 81.1 };
const T_ANG: Record<number, number> = { 5: 32.9, 6: 38.1, 7: 41.3, 8: 44.0, 9: 46.3, 10: 48.4, 11: 50.5, 12: 52.6, 13: 54.7, 14: 56.7, 15: 58.8, 16: 60.8, 17: 62.9, 18: 65.0, 19: 67.2, 20: 69.4, 21: 71.7, 22: 74.1, 23: 76.8, 24: 79.7, 25: 83.3 };
const T_SLP: Record<number, number> = { 8: 28.9, 9: 33.1, 10: 35.9, 11: 38.0, 12: 39.8, 13: 41.4, 14: 42.9, 15: 44.2, 16: 45.5, 17: 46.7, 18: 47.9, 19: 49.0, 20: 50.1, 21: 51.2, 22: 52.2, 23: 53.3, 24: 54.3, 25: 55.3, 26: 56.3, 27: 57.3, 28: 58.3, 29: 59.4, 30: 60.4, 31: 61.5, 32: 62.6, 33: 63.7, 34: 64.9, 35: 66.1, 36: 67.5, 37: 69.0, 38: 70.8, 39: 73.0, 40: 76.5 };

// ---- the eight measures -----------------------------------------------------
export const LEVEL2_MEASURES: L2Measure[] = [
  {
    key: "l2-depression",
    label: "Level 2 - Depression (Adult)",
    short: "L2 Depression",
    icon: "🌧️",
    instrument: "PROMIS Emotional Distress - Depression - Short Form",
    domain: "Depression",
    window: "past 7 days",
    instructions:
      "The questions below ask how often you have been bothered by each problem during the past SEVEN (7) DAYS.",
    scale: PROMIS,
    stackItems: false,
    items: [
      { text: "I felt worthless." },
      { text: "I felt that I had nothing to look forward to." },
      { text: "I felt helpless." },
      { text: "I felt sad." },
      { text: "I felt like a failure." },
      { text: "I felt depressed." },
      { text: "I felt unhappy." },
      { text: "I felt hopeless." },
    ],
    scoring: { kind: "promis", table: T_DEP },
  },
  {
    key: "l2-anxiety",
    label: "Level 2 - Anxiety (Adult)",
    short: "L2 Anxiety",
    icon: "😰",
    instrument: "PROMIS Emotional Distress - Anxiety - Short Form",
    domain: "Anxiety",
    window: "past 7 days",
    instructions:
      "The questions below ask how often you have been bothered by each problem during the past SEVEN (7) DAYS.",
    scale: PROMIS,
    stackItems: false,
    items: [
      { text: "I felt fearful." },
      { text: "I felt anxious." },
      { text: "I felt worried." },
      { text: "I found it hard to focus on anything other than my anxiety." },
      { text: "I felt nervous." },
      { text: "I felt uneasy." },
      { text: "I felt tense." },
    ],
    scoring: { kind: "promis", table: T_ANX },
  },
  {
    key: "l2-anger",
    label: "Level 2 - Anger (Adult)",
    short: "L2 Anger",
    icon: "🔥",
    instrument: "PROMIS Emotional Distress - Anger - Short Form",
    domain: "Anger",
    window: "past 7 days",
    instructions:
      "The questions below ask how often you have been bothered by each problem during the past SEVEN (7) DAYS.",
    scale: PROMIS,
    stackItems: false,
    items: [
      { text: "I was irritated more than people knew." },
      { text: "I felt angry." },
      { text: "I felt like I was ready to explode." },
      { text: "I was grouchy." },
      { text: "I felt annoyed." },
    ],
    scoring: { kind: "promis", table: T_ANG },
  },
  {
    key: "l2-mania",
    label: "Level 2 - Mania (Adult)",
    short: "L2 Mania",
    icon: "⚡",
    instrument: "Altman Self-Rating Mania Scale (ASRM)",
    domain: "Mania",
    window: "past week",
    instructions:
      "Choose the one statement in each group that best describes the way you have been feeling for the past week. (“Occasionally” = once or twice; “often” = several times or more; “frequently” = most of the time.)",
    scale: PROMIS, // unused: every item carries its own anchored options
    stackItems: true,
    items: [
      {
        text: "Happier or more cheerful",
        scale: opts([
          "I do not feel happier or more cheerful than usual.",
          "I occasionally feel happier or more cheerful than usual.",
          "I often feel happier or more cheerful than usual.",
          "I feel happier or more cheerful than usual most of the time.",
          "I feel happier or more cheerful than usual all of the time.",
        ]),
      },
      {
        text: "Self-confidence",
        scale: opts([
          "I do not feel more self-confident than usual.",
          "I occasionally feel more self-confident than usual.",
          "I often feel more self-confident than usual.",
          "I frequently feel more self-confident than usual.",
          "I feel extremely self-confident all of the time.",
        ]),
      },
      {
        text: "Need for sleep",
        scale: opts([
          "I do not need less sleep than usual.",
          "I occasionally need less sleep than usual.",
          "I often need less sleep than usual.",
          "I frequently need less sleep than usual.",
          "I can go all day and all night without any sleep and still not feel tired.",
        ]),
      },
      {
        text: "Talkativeness",
        scale: opts([
          "I do not talk more than usual.",
          "I occasionally talk more than usual.",
          "I often talk more than usual.",
          "I frequently talk more than usual.",
          "I talk constantly and cannot be interrupted.",
        ]),
      },
      {
        text: "Activity level",
        scale: opts([
          "I have not been more active (either socially, sexually, at work, home, or school) than usual.",
          "I have occasionally been more active than usual.",
          "I have often been more active than usual.",
          "I have frequently been more active than usual.",
          "I am constantly more active or on the go all the time.",
        ]),
      },
    ],
    scoring: { kind: "asrm" },
  },
  {
    key: "l2-sleep",
    label: "Level 2 - Sleep Disturbance (Adult)",
    short: "L2 Sleep",
    icon: "😴",
    instrument: "PROMIS - Sleep Disturbance - Short Form",
    domain: "Sleep problems",
    window: "past 7 days",
    instructions:
      "The questions below ask about your sleep during the past SEVEN (7) DAYS.",
    scale: PROMIS,
    stackItems: false,
    items: [
      { text: "My sleep was restless.", scale: fwd(A) },
      { text: "I was satisfied with my sleep.", scale: rev(A) },
      { text: "My sleep was refreshing.", scale: rev(A) },
      { text: "I had difficulty falling asleep.", scale: fwd(A) },
      { text: "I had trouble staying asleep.", scale: fwd(N) },
      { text: "I had trouble sleeping.", scale: fwd(N) },
      { text: "I got enough sleep.", scale: rev(N) },
      { text: "My sleep quality was...", scale: rev(Q) },
    ],
    scoring: { kind: "promis", table: T_SLP },
  },
  {
    key: "l2-somatic",
    label: "Level 2 - Somatic Symptom (Adult)",
    short: "L2 Somatic",
    icon: "🩺",
    instrument: "Patient Health Questionnaire - Physical Symptoms (PHQ-15)",
    domain: "Somatic symptoms",
    window: "past 7 days",
    instructions:
      "During the past SEVEN (7) DAYS, how much have you been bothered by any of the following problems?",
    scale: PHQ,
    stackItems: false,
    items: [
      { text: "Stomach pain" },
      { text: "Back pain" },
      { text: "Pain in your arms, legs, or joints (knees, hips, etc.)" },
      { text: "Menstrual cramps or other problems with your periods (women only)", optional: true },
      { text: "Headaches" },
      { text: "Chest pain" },
      { text: "Dizziness" },
      { text: "Fainting spells" },
      { text: "Feeling your heart pound or race" },
      { text: "Shortness of breath" },
      { text: "Pain or problems during sexual intercourse" },
      { text: "Constipation, loose bowels, or diarrhea" },
      { text: "Nausea, gas, or indigestion" },
      { text: "Feeling tired or having low energy" },
      { text: "Trouble sleeping" },
    ],
    scoring: { kind: "phq" },
  },
  {
    key: "l2-repetitive",
    label: "Level 2 - Repetitive Thoughts & Behaviors (Adult)",
    short: "L2 Repetitive",
    icon: "🔁",
    instrument: "Florida Obsessive-Compulsive Inventory (FOCI) Severity Scale",
    domain: "Repetitive thoughts and behaviors",
    window: "past 7 days",
    instructions:
      "These questions ask about unwanted repeated thoughts, images, or urges, and behaviors or mental acts done over and over, during the past SEVEN (7) DAYS.",
    scale: PROMIS,
    stackItems: true,
    items: [
      {
        text: "On average, how much time is occupied by these thoughts or behaviors each day?",
        scale: opts([
          "None",
          "Mild (less than an hour a day)",
          "Moderate (1 to 3 hours a day)",
          "Severe (3 to 8 hours a day)",
          "Extreme (more than 8 hours a day)",
        ]),
      },
      {
        text: "How much distress do these thoughts or behaviors cause you?",
        scale: opts([
          "None",
          "Mild (slightly disturbing)",
          "Moderate (disturbing but still manageable)",
          "Severe (very disturbing)",
          "Extreme (overwhelming distress)",
        ]),
      },
      {
        text: "How hard is it for you to control these thoughts or behaviors?",
        scale: opts([
          "Complete control",
          "Much control (usually able to control thoughts or behaviors)",
          "Moderate control (sometimes able to control thoughts or behaviors)",
          "Little control (infrequently able to control thoughts or behaviors)",
          "No control (unable to control thoughts or behaviors)",
        ]),
      },
      {
        text: "How much do these thoughts or behaviors cause you to avoid doing anything, going anyplace, or being with anyone?",
        scale: opts([
          "No avoidance",
          "Mild (occasional avoidance)",
          "Moderate (regularly avoid doing these things)",
          "Severe (frequent and extensive avoidance)",
          "Extreme (nearly complete avoidance; housebound)",
        ]),
      },
      {
        text: "How much do these thoughts or behaviors interfere with school, work, or your social or family life?",
        scale: opts([
          "None",
          "Mild (slight interference)",
          "Moderate (definite interference with functioning, but still manageable)",
          "Severe (substantial interference)",
          "Extreme (near-total interference; incapacitated)",
        ]),
      },
    ],
    scoring: { kind: "foci" },
  },
  {
    key: "l2-substance",
    label: "Level 2 - Substance Use (Adult)",
    short: "L2 Substance",
    icon: "💊",
    instrument: "Adapted NIDA-Modified ASSIST",
    domain: "Substance use",
    window: "past 2 weeks",
    instructions:
      "During the past TWO (2) WEEKS, about how often did you use any of the following ON YOUR OWN - that is, without a doctor's prescription, in greater amounts, or longer than prescribed - or any of the drugs listed?",
    scale: FREQ_2W,
    stackItems: false,
    items: [
      { text: "Painkillers (like Vicodin)" },
      { text: "Stimulants (like Ritalin, Adderall)" },
      { text: "Sedatives or tranquilizers (like sleeping pills or Valium)" },
      { text: "Marijuana" },
      { text: "Cocaine or crack" },
      { text: "Club drugs (like ecstasy)" },
      { text: "Hallucinogens (like LSD)" },
      { text: "Heroin" },
      { text: "Inhalants or solvents (like glue)" },
      { text: "Methamphetamine (like speed)" },
    ],
    scoring: { kind: "substance" },
  },

  // -------- Disorder-specific Severity Measures (Adult) ----------------------
  {
    key: "sev-depression",
    label: "Severity Measure - Depression (Adult)",
    short: "Depression (PHQ-9)",
    icon: "😔",
    instrument: "PHQ-9",
    domain: "depression",
    window: "last 7 days",
    tier: "severity",
    instructions: "Over the last 7 days, how often have you been bothered by any of the following problems?",
    scale: PHQ4,
    stackItems: false,
    items: [
      { text: "Little interest or pleasure in doing things" },
      { text: "Feeling down, depressed, or hopeless" },
      { text: "Trouble falling or staying asleep, or sleeping too much" },
      { text: "Feeling tired or having little energy" },
      { text: "Poor appetite or overeating" },
      { text: "Feeling bad about yourself - or that you are a failure or have let yourself or your family down" },
      { text: "Trouble concentrating on things, such as reading the newspaper or watching television" },
      { text: "Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual" },
      { text: "Thoughts that you would be better off dead or of hurting yourself in some way" },
    ],
    scoring: { kind: "phq9" },
  },
  {
    key: "sev-gad",
    label: "Severity Measure - Generalized Anxiety Disorder (Adult)",
    short: "GAD severity",
    icon: "😟",
    instrument: "DSM-5-TR GAD severity measure",
    domain: "generalized anxiety disorder",
    window: "past 7 days",
    tier: "severity",
    instructions: "During the PAST 7 DAYS, I have…",
    scale: NEVER_ALL,
    stackItems: false,
    items: [
      { text: "felt moments of sudden terror, fear, or fright" },
      { text: "felt anxious, worried, or nervous" },
      { text: "had thoughts of bad things happening, such as family tragedy, ill health, loss of a job, or accidents" },
      { text: "felt a racing heart, sweaty, trouble breathing, faint, or shaky" },
      { text: "felt tense muscles, felt on edge or restless, or had trouble relaxing or trouble sleeping" },
      { text: "avoided, or did not approach or enter, situations about which I worry" },
      { text: "left situations early or participated only minimally due to worries" },
      { text: "spent lots of time making decisions, putting off making decisions, or preparing for situations, due to worries" },
      { text: "sought reassurance from others due to worries" },
      { text: "needed help to cope with anxiety (e.g., alcohol or medication, superstitious objects, or other people)" },
    ],
    scoring: { kind: "average" },
  },
  {
    key: "sev-social-anxiety",
    label: "Severity Measure - Social Anxiety Disorder (Adult)",
    short: "Social anxiety",
    icon: "🫣",
    instrument: "DSM-5-TR social anxiety disorder severity measure",
    domain: "social anxiety disorder",
    window: "past 7 days",
    tier: "severity",
    instructions: "During the PAST 7 DAYS, I have…",
    intro:
      "These questions ask about social situations - for example: public speaking, speaking in meetings, attending social events or parties, introducing yourself to others, having conversations, giving and receiving compliments, making requests of others, and eating and writing in public.",
    scale: NEVER_ALL,
    stackItems: false,
    items: [
      { text: "felt moments of sudden terror, fear, or fright in social situations" },
      { text: "felt anxious, worried, or nervous about social situations" },
      { text: "had thoughts of being rejected, humiliated, embarrassed, ridiculed, or offending others" },
      { text: "felt a racing heart, sweaty, trouble breathing, faint, or shaky in social situations" },
      { text: "felt tense muscles, felt on edge or restless, or had trouble relaxing in social situations" },
      { text: "avoided, or did not approach or enter, social situations" },
      { text: "left social situations early or participated only minimally (e.g., said little, avoided eye contact)" },
      { text: "spent a lot of time preparing what to say or how to act in social situations" },
      { text: "distracted myself to avoid thinking about social situations" },
      { text: "needed help to cope with social situations (e.g., alcohol or medications, superstitious objects)" },
    ],
    scoring: { kind: "average" },
  },
  {
    key: "sev-separation-anxiety",
    label: "Severity Measure - Separation Anxiety Disorder (Adult)",
    short: "Separation anxiety",
    icon: "🫂",
    instrument: "DSM-5-TR separation anxiety disorder severity measure",
    domain: "separation anxiety disorder",
    window: "past 7 days",
    tier: "severity",
    instructions: "During the PAST 7 DAYS, I have…",
    intro: "These questions ask about being separated from home or from people who are important to you.",
    scale: NEVER_ALL,
    stackItems: false,
    items: [
      { text: "felt moments of sudden terror, fear, or fright when separated" },
      { text: "felt anxious, worried, or nervous about being separated" },
      { text: "have had thoughts of bad things happening to people important to me or bad things happening to me when separated from them (e.g., getting lost, accidents)" },
      { text: "felt a racing heart, sweaty, trouble breathing, faint, or shaky when separated" },
      { text: "felt tense muscles, felt on edge or restless, or had trouble relaxing or trouble sleeping when separated" },
      { text: "avoided going places where I would be separated" },
      { text: "when separated, left places early to go home" },
      { text: "spent a lot of time preparing for how to deal with separation" },
      { text: "distracted myself to avoid thinking about being separated" },
      { text: "needed help to cope with separation (e.g., alcohol or medications, superstitious objects)" },
    ],
    scoring: { kind: "average" },
  },
  {
    key: "sev-acute-stress",
    label: "Severity of Acute Stress Symptoms (Adult)",
    short: "Acute stress",
    icon: "💥",
    instrument: "National Stressful Events Survey - Acute Stress Disorder Short Scale (NSESSS)",
    domain: "acute stress disorder",
    window: "past 7 days",
    tier: "severity",
    instructions:
      "How much have you been bothered during the PAST SEVEN (7) DAYS by each of the following problems that occurred or became worse after an extremely stressful event or experience?",
    scale: NSESSS,
    stackItems: true,
    extraInfo: TRAUMA_INFO,
    items: [
      { text: "Having “flashbacks,” that is, you suddenly acted or felt as if a stressful experience from the past was happening all over again (for example, you reexperienced parts of a stressful experience by seeing, hearing, smelling, or physically feeling parts of the experience)?" },
      { text: "Feeling very emotionally upset when something reminded you of a stressful experience?" },
      { text: "Feeling detached or distant from yourself, your body, your physical surroundings, or your memories?" },
      { text: "Trying to avoid thoughts, feelings, or physical sensations that reminded you of a stressful experience?" },
      { text: "Being “super alert,” on guard, or constantly on the lookout for danger?" },
      { text: "Feeling jumpy or easily startled when you hear an unexpected noise?" },
      { text: "Being extremely irritable or angry to the point where you yelled at other people, got into fights, or destroyed things?" },
    ],
    scoring: { kind: "average" },
  },
  {
    key: "sev-ptsd",
    label: "Severity of Posttraumatic Stress Symptoms (Adult)",
    short: "PTSD severity",
    icon: "🌩️",
    instrument: "National Stressful Events Survey - PTSD Short Scale (NSESSS)",
    domain: "posttraumatic stress disorder",
    window: "past 7 days",
    tier: "severity",
    instructions:
      "How much have you been bothered during the PAST SEVEN (7) DAYS by each of the following problems that occurred or became worse after an extremely stressful event or experience?",
    scale: NSESSS,
    stackItems: true,
    extraInfo: TRAUMA_INFO,
    items: [
      { text: "Having “flashbacks,” that is, you suddenly acted or felt as if a stressful experience from the past was happening all over again (for example, you reexperienced parts of a stressful experience by seeing, hearing, smelling, or physically feeling parts of the experience)?" },
      { text: "Feeling very emotionally upset when something reminded you of a stressful experience?" },
      { text: "Trying to avoid thoughts, feelings, or physical sensations that reminded you of a stressful experience?" },
      { text: "Thinking that a stressful event happened because you or someone else (who didn't directly harm you) did something wrong or didn't do everything possible to prevent it, or because of something about you?" },
      { text: "Having a very negative emotional state (for example, you were experiencing lots of fear, anger, guilt, shame, or horror) after a stressful experience?" },
      { text: "Losing interest in activities you used to enjoy before having a stressful experience?" },
      { text: "Being “super alert,” on guard, or constantly on the lookout for danger?" },
      { text: "Feeling jumpy or easily startled when you hear an unexpected noise?" },
      { text: "Being extremely irritable or angry to the point where you yelled at other people, got into fights, or destroyed things?" },
    ],
    scoring: { kind: "average" },
  },
];

const BY_KEY: Record<string, L2Measure> = Object.fromEntries(LEVEL2_MEASURES.map((m) => [m.key, m]));

export function isLevel2Form(formKey: string): boolean {
  // True for any scored measure (Level 2 follow-ups and disorder-severity measures).
  return formKey in BY_KEY;
}
export function getLevel2(formKey: string): L2Measure | undefined {
  return BY_KEY[formKey];
}

// ---- scoring ----------------------------------------------------------------
function tBand(t: number): string {
  if (t < 55) return "None to slight";
  if (t < 60) return "Mild";
  if (t < 70) return "Moderate";
  return "Severe";
}

export interface L2ItemResult {
  text: string;
  answer: string;
  value: number | null;
  /** 0-4 bucket for colour coding, derived from the item's own scale range. */
  bucket: number | null;
}
export interface L2Result {
  measure: L2Measure;
  items: L2ItemResult[];
  answered: number;
  total: number;
  raw: number;
  prorated?: number;
  tScore?: number;
  /** main interpretation band/label */
  band: string;
  /** severity bucket for the headline pill (0 none .. 4 severe) */
  sev: number;
  flagged: boolean;
  /** extra interpretation line */
  note: string;
  /** substance: substances used (value > 0) */
  used?: string[];
  /** urgent banner (e.g. PHQ-9 item 9 endorsed) */
  alert?: string;
}

export function scoreLevel2(formKey: string, answers: Record<string, string>): L2Result | null {
  const m = BY_KEY[formKey];
  if (!m) return null;

  const items: L2ItemResult[] = m.items.map((it, i) => {
    const sc = it.scale ?? m.scale;
    const answer = answers[`q${i + 1}`] ?? "";
    const opt = sc.find((o) => o.label === answer);
    const value = opt ? opt.value : null;
    let bucket: number | null = null;
    if (value !== null) {
      const vals = sc.map((o) => o.value);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      bucket = hi === lo ? 0 : Math.round(((value - lo) / (hi - lo)) * 4);
    }
    return { text: it.text, answer, value, bucket };
  });

  const valued = items.filter((r) => r.value !== null);
  const answered = valued.length;
  const total = m.items.length;
  const raw = valued.reduce((s, r) => s + (r.value as number), 0);

  const sevFromBand = (b: string): number => {
    const x = b.toLowerCase();
    if (x.includes("severe") || x.includes("high") || x.includes("positive") || x.includes("extreme")) return 4;
    if (x.includes("moderate") || x.includes("medium")) return 3;
    if (x.includes("mild") || x.includes("low")) return 2;
    return 0;
  };

  if (m.scoring.kind === "promis") {
    const table = m.scoring.table as Record<number, number>;
    if (answered < Math.ceil(total * 0.75)) {
      return { measure: m, items, answered, total, raw, band: "Incomplete", sev: 0, flagged: false, note: "Too many items left blank to score (more than 25% missing)." };
    }
    const prorated = answered === total ? raw : Math.round((raw * total) / answered);
    const tScore = table[prorated];
    const band = tBand(tScore);
    return {
      measure: m, items, answered, total, raw, prorated, tScore, band,
      sev: sevFromBand(band), flagged: tScore >= 60,
      note: `T-score ${tScore.toFixed(1)} (mean 50, SD 10). ${band}.`,
    };
  }

  if (m.scoring.kind === "phq") {
    const band = raw <= 4 ? "Minimal" : raw <= 9 ? "Low" : raw <= 14 ? "Medium" : "High";
    return { measure: m, items, answered, total, raw, band, sev: sevFromBand(band), flagged: raw >= 10, note: `Somatic symptom severity: ${band} (raw ${raw} of 30).` };
  }

  if (m.scoring.kind === "asrm") {
    const flagged = raw >= 6;
    return { measure: m, items, answered, total, raw, band: flagged ? "Positive screen" : "Below threshold", sev: flagged ? 4 : 0, flagged, note: flagged ? `Raw ${raw} of 20. A score of 6 or higher suggests a high probability of a manic or hypomanic condition and may warrant further diagnostic work-up.` : `Raw ${raw} of 20. Below the screening threshold of 6.` };
  }

  if (m.scoring.kind === "foci") {
    const avg = answered ? raw / answered : 0;
    const avgLabel = ["None", "Mild", "Moderate", "Severe", "Extreme"][Math.round(avg)];
    const flagged = raw >= 8;
    return { measure: m, items, answered, total, raw, band: `Average: ${avgLabel}`, sev: Math.round(avg), flagged, note: `Raw ${raw} of 20 (average ${avg.toFixed(1)} = ${avgLabel}).${flagged ? " A score of 8 or higher may warrant a more detailed assessment for obsessive-compulsive disorder." : ""}` };
  }

  if (m.scoring.kind === "phq9") {
    const band =
      raw <= 4 ? "None / minimal" : raw <= 9 ? "Mild" : raw <= 14 ? "Moderate" : raw <= 19 ? "Moderately severe" : "Severe";
    const q9 = items[8]?.value ?? 0; // item 9: thoughts of being better off dead / self-harm
    return {
      measure: m, items, answered, total, raw, band, sev: sevFromBand(band), flagged: raw >= 10 || q9 > 0,
      note: `Depression severity: ${band} (raw ${raw} of 27).`,
      alert: q9 > 0 ? "Item 9 (thoughts of being better off dead or of self-harm) was endorsed. Review per your risk-assessment protocol." : undefined,
    };
  }

  if (m.scoring.kind === "average") {
    const avg = answered ? raw / answered : 0;
    const avgLabel = ["None", "Mild", "Moderate", "Severe", "Extreme"][Math.round(avg)];
    const maxRaw = total * 4;
    return {
      measure: m, items, answered, total, raw, band: avgLabel, sev: Math.round(avg), flagged: avg >= 2,
      note: `Raw ${raw} of ${maxRaw} · average ${avg.toFixed(1)} = ${avgLabel}.`,
    };
  }

  // substance: each item independent
  const used = items.filter((r) => (r.value ?? 0) > 0).map((r) => r.text);
  const flagged = used.length > 0;
  return { measure: m, items, answered, total, raw, band: flagged ? `${used.length} substance${used.length > 1 ? "s" : ""} endorsed` : "None endorsed", sev: flagged ? 4 : 0, flagged, note: flagged ? "Each substance is interpreted independently; endorsing several at scores above zero indicates greater severity and complexity of use." : "No substance use endorsed in the past two weeks.", used };
}

// ---- form section generation ------------------------------------------------
const L2_CLIENT_INFO = (m: L2Measure): FormSection => ({
  id: `${m.key}-info`,
  title: "Your Information",
  fields: [
    { name: "full_name", label: "Name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "dob", label: "Date of birth", type: "date", required: true },
    ...(m.extraInfo ?? []),
    {
      name: "informant_relationship",
      label: "If you are completing this on behalf of someone else, what is your relationship to them?",
      type: "text",
    },
    {
      name: "informant_hours",
      label: "In a typical week, about how many hours do you spend with them?",
      type: "text",
    },
  ],
});

export function level2Sections(m: L2Measure): FormSection[] {
  const fields: FormField[] = m.items.map((it, i) => {
    const sc = it.scale ?? m.scale;
    return {
      name: `q${i + 1}`,
      label: `${i + 1}. ${it.text}`,
      type: "radio",
      options: sc.map((o) => o.label),
      required: !it.optional,
      stack: m.stackItems,
    };
  });
  const lead =
    m.tier === "severity"
      ? `This is the DSM-5-TR ${m.label} (${m.instrument}). Please answer about the ${m.window}.`
      : `This is the DSM-5-TR ${m.label.replace(/^Level 2 - /, "Level 2 ")} follow-up measure (${m.instrument}). Please answer about the ${m.window}.`;
  return [
    L2_CLIENT_INFO(m),
    {
      id: `${m.key}-items`,
      title: m.instructions,
      titleBelowIntro: true,
      intro: m.intro ? [lead, m.intro] : [lead],
      fields,
    },
  ];
}
