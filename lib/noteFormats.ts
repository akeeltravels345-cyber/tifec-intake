// Client-safe clinical-note format definitions (no fs/crypto), so both the
// server store (lib/sessionNotes.ts) and the client editor (SessionNotes.tsx)
// can import them without pulling server-only modules into the browser bundle.

export type NoteFormat = "birp" | "soap" | "dap";
export interface NoteFieldDef { key: string; label: string; hint: string; alts: string[] }
export interface NoteContent { format: NoteFormat; fields: Record<string, string> }

// BIRP is the practice's default form.
export const DEFAULT_FORMAT: NoteFormat = "birp";

export const NOTE_FORMATS: Record<NoteFormat, { label: string; fields: NoteFieldDef[] }> = {
  birp: {
    label: "BIRP",
    fields: [
      { key: "b", label: "Behavior", hint: "What the client presented with — their reports and what you observed.", alts: ["behavior", "behaviour", "b"] },
      { key: "i", label: "Intervention", hint: "What you did this session — approaches, techniques, focus.", alts: ["intervention", "interventions", "i"] },
      { key: "r", label: "Response", hint: "How the client responded to the intervention.", alts: ["response", "r"] },
      { key: "p", label: "Plan", hint: "Next steps, homework, focus for next session.", alts: ["plan", "p"] },
    ],
  },
  soap: {
    label: "SOAP",
    fields: [
      { key: "s", label: "Subjective", hint: "What the client reports: how they say they're doing.", alts: ["subjective", "s"] },
      { key: "o", label: "Objective", hint: "What you observed: presentation, affect, measures.", alts: ["objective", "o"] },
      { key: "a", label: "Assessment", hint: "Your clinical impression / progress toward goals.", alts: ["assessment", "analysis", "impression", "a"] },
      { key: "p", label: "Plan", hint: "Next steps, interventions, homework, follow-up.", alts: ["plan", "p"] },
    ],
  },
  dap: {
    label: "DAP",
    fields: [
      { key: "d", label: "Data", hint: "What happened — the client's reports and your observations.", alts: ["data", "d"] },
      { key: "a", label: "Assessment", hint: "Your clinical impression / progress toward goals.", alts: ["assessment", "analysis", "impression", "a"] },
      { key: "p", label: "Plan", hint: "Next steps, homework, follow-up.", alts: ["plan", "p"] },
    ],
  },
};

export function isNoteFormat(v: unknown): v is NoteFormat {
  return v === "birp" || v === "soap" || v === "dap";
}
