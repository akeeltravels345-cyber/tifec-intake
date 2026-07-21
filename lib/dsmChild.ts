// Scoring for the DSM-5-TR Parent/Guardian-Rated Level 1 Cross-Cutting Symptom
// Measure - Child Age 6-17. 25 items across 12 domains. Items 1-19 use the 0-4
// scale; items 20-25 are Yes/No/Don't Know (substance use + suicide).
// Per APA Table 1: most domains flag at Mild (2)+; Inattention and Psychosis at
// Slight (1)+; Substance Use and Suicidal flag on any "Yes" or "Don't Know".
// Screening aid, not a diagnosis. Field names: cq1..cq25.

export interface ChildDomain {
  roman: string;
  id: string;
  name: string;
  items: number[];
  threshold?: 1 | 2; // for 0-4 scale domains
  yesno?: boolean; // Yes/No/Don't Know domains (substance use, suicidal)
}

export const DSM_CHILD_DOMAINS: ChildDomain[] = [
  { roman: "I", id: "somatic", name: "Somatic Symptoms", items: [1, 2], threshold: 2 },
  { roman: "II", id: "sleep", name: "Sleep Problems", items: [3], threshold: 2 },
  { roman: "III", id: "inattention", name: "Inattention", items: [4], threshold: 1 },
  { roman: "IV", id: "depression", name: "Depression", items: [5, 6], threshold: 2 },
  { roman: "V", id: "anger", name: "Anger", items: [8], threshold: 2 },
  { roman: "VI", id: "irritability", name: "Irritability", items: [7], threshold: 2 },
  { roman: "VII", id: "mania", name: "Mania", items: [9, 10], threshold: 2 },
  { roman: "VIII", id: "anxiety", name: "Anxiety", items: [11, 12, 13], threshold: 2 },
  { roman: "IX", id: "psychosis", name: "Psychosis", items: [14, 15], threshold: 1 },
  { roman: "X", id: "repetitive", name: "Repetitive Thoughts & Behaviors", items: [16, 17, 18, 19], threshold: 2 },
  { roman: "XI", id: "substance", name: "Substance Use", items: [20, 21, 22, 23], yesno: true },
  { roman: "XII", id: "suicidal", name: "Suicidal Ideation / Attempts", items: [24, 25], yesno: true },
];

const LEVEL = ["None", "Slight", "Mild", "Moderate", "Severe"];

export interface ChildScore {
  domain: ChildDomain;
  display: string; // e.g. "Mild (2)", "Yes", "No", "Not answered"
  flagged: boolean;
}

/** `prefix` selects the field naming: "cq" = parent/guardian-rated, "sq" = child self-report. */
export function scoreDsmChild(answers: Record<string, string>, prefix: "cq" | "sq" = "cq"): ChildScore[] {
  return DSM_CHILD_DOMAINS.map((domain) => {
    const raw = domain.items.map((n) => answers[`${prefix}${n}`]).filter((v) => v != null && v !== "");
    if (domain.yesno) {
      const norm = raw.map((v) => v.trim().toLowerCase());
      const yes = norm.some((v) => v === "yes");
      const dk = norm.some((v) => v.startsWith("don"));
      return {
        domain,
        display: yes ? "Yes" : dk ? "Don't Know" : raw.length ? "No" : "Not answered",
        flagged: yes || dk,
      };
    }
    const scores = raw.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v) && v >= 0 && v <= 4);
    const highest = scores.length ? Math.max(...scores) : null;
    return {
      domain,
      display: highest === null ? "Not answered" : `${LEVEL[highest]} (${highest})`,
      flagged: highest !== null && highest >= (domain.threshold ?? 2),
    };
  });
}

export function isDsmChildForm(formKey: string): boolean {
  return formKey === "dsm5-level1-child";
}

/** The 11-17 version the young person completes about themselves (fields sq1..sq25). */
export function isDsmChildSelfForm(formKey: string): boolean {
  return formKey === "dsm5-level1-child-self";
}
