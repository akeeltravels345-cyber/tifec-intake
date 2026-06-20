// Scoring for the DSM-5-TR Self-Rated Level 1 Cross-Cutting Symptom Measure (Adult).
//
// Per APA's "Instructions to Clinicians": review the highest item score within
// each of the 13 domains. A highest score of Mild (2) or greater - or Slight (1)
// or greater for Suicidal Ideation, Psychosis, and Substance Use - may guide
// further inquiry. This is a screening aid, NOT a diagnosis.

export interface DsmDomain {
  roman: string;
  id: string;
  name: string;
  items: number[]; // dsm_q<item> question numbers
  threshold: 1 | 2; // highest item score at/above this flags the domain
}

export const DSM_DOMAINS: DsmDomain[] = [
  { roman: "I", id: "depression", name: "Depression", items: [1, 2], threshold: 2 },
  { roman: "II", id: "anger", name: "Anger", items: [3], threshold: 2 },
  { roman: "III", id: "mania", name: "Mania", items: [4, 5], threshold: 2 },
  { roman: "IV", id: "anxiety", name: "Anxiety", items: [6, 7, 8], threshold: 2 },
  { roman: "V", id: "somatic", name: "Somatic Symptoms", items: [9, 10], threshold: 2 },
  { roman: "VI", id: "suicidal", name: "Suicidal Ideation", items: [11], threshold: 1 },
  { roman: "VII", id: "psychosis", name: "Psychosis", items: [12, 13], threshold: 1 },
  { roman: "VIII", id: "sleep", name: "Sleep Problems", items: [14], threshold: 2 },
  { roman: "IX", id: "memory", name: "Memory", items: [15], threshold: 2 },
  { roman: "X", id: "repetitive", name: "Repetitive Thoughts & Behaviors", items: [16, 17], threshold: 2 },
  { roman: "XI", id: "dissociation", name: "Dissociation", items: [18], threshold: 2 },
  { roman: "XII", id: "personality", name: "Personality Functioning", items: [19, 20], threshold: 2 },
  { roman: "XIII", id: "substance", name: "Substance Use", items: [21, 22, 23], threshold: 1 },
];

const LEVEL_LABEL = ["None", "Slight", "Mild", "Moderate", "Severe"];

export interface DomainScore {
  domain: DsmDomain;
  highest: number | null; // 0-4, or null if no items answered
  highestLabel: string;
  flagged: boolean;
}

/** Answers store the option string (e.g. "3 - Moderate …"); the leading digit is the score. */
function itemScore(answers: Record<string, string>, n: number): number | null {
  const raw = answers[`dsm_q${n}`];
  if (!raw) return null;
  const v = parseInt(raw, 10);
  return Number.isNaN(v) ? null : v;
}

export function scoreDsm(answers: Record<string, string>): DomainScore[] {
  return DSM_DOMAINS.map((domain) => {
    const scores = domain.items
      .map((n) => itemScore(answers, n))
      .filter((v): v is number => v !== null);
    const highest = scores.length ? Math.max(...scores) : null;
    return {
      domain,
      highest,
      highestLabel: highest === null ? "-" : LEVEL_LABEL[highest],
      flagged: highest !== null && highest >= domain.threshold,
    };
  });
}

export function isDsmForm(formKey: string): boolean {
  return formKey === "dsm5-level1-adult";
}
