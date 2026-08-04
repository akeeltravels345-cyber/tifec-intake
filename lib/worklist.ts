// Shared feature worklist (Akeel + Nick). Stored on the existing `feedback`
// table under a reserved category, so there's no new migration — it works on
// live immediately and degrades gracefully if the table is ever missing.
import { insertFeedback, listFeedback, updateFeedbackMessage } from "./feedback";

export type Priority = "nice" | "important" | "urgent";
export type FeatureStatus = "open" | "in_progress" | "done";

/** An attached file or voice note. Bytes live in the shared doc store (keyed by
 *  docId); only this lightweight pointer is kept on the feature. */
export interface Attachment { docId: string; name: string; mime: string; kind: "file" | "voice" }

/** A message on a feature's thread — a clarification question or a reply. */
export interface Note { by: string; at: string; text: string }

export interface Feature {
  id: string;
  requestedBy: string; // clinician id
  name: string;
  description: string;
  flow: string;        // "starts … → ends …"
  priority: Priority;
  status: FeatureStatus;
  attachments: Attachment[];
  notes: Note[];
  createdAt: string;   // ISO
}

const CATEGORY = "worklist";

export async function addFeature(
  requestedBy: string,
  f: { name: string; description: string; flow: string; priority: string; attachments?: Attachment[] }
): Promise<void> {
  const priority: Priority = f.priority === "urgent" || f.priority === "important" ? f.priority : "nice";
  const payload = JSON.stringify({
    name: f.name.trim(), description: f.description.trim(), flow: f.flow.trim(), priority,
    attachments: (f.attachments || []).slice(0, 6),
  });
  await insertFeedback(CATEGORY, payload, requestedBy);
}

const RANK: Record<Priority, number> = { urgent: 0, important: 1, nice: 2 };
const STATUS_RANK: Record<FeatureStatus, number> = { in_progress: 0, open: 1, done: 2 };

function normStatus(s: unknown): FeatureStatus {
  return s === "done" || s === "in_progress" ? s : "open";
}

export async function listFeatures(): Promise<Feature[]> {
  let rows;
  try {
    rows = await listFeedback(300);
  } catch {
    return []; // never break the page if the store is unavailable
  }
  const feats = rows
    .filter((r) => r.category === CATEGORY)
    .map((r): Feature => {
      let p: Partial<Feature> = {};
      try { p = JSON.parse(r.message) as Partial<Feature>; } catch { /* legacy/plain text */ }
      return {
        id: r.id,
        requestedBy: r.clinician_id,
        name: p.name || "(untitled)",
        description: p.description || "",
        flow: p.flow || "",
        priority: (p.priority as Priority) || "nice",
        status: normStatus(p.status),
        attachments: Array.isArray(p.attachments) ? p.attachments : [],
        notes: Array.isArray(p.notes) ? (p.notes as Note[]) : [],
        createdAt: r.created_at,
      };
    });
  // Done sinks to the bottom; within a status, urgent first, then newest.
  return feats.sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    RANK[a.priority] - RANK[b.priority] ||
    b.createdAt.localeCompare(a.createdAt));
}

/** Load, mutate and re-save one feature's JSON payload. */
async function patchFeature(id: string, patch: (f: Feature) => Partial<Feature>): Promise<boolean> {
  const all = await listFeatures();
  const f = all.find((x) => x.id === id);
  if (!f) return false;
  const next = { ...f, ...patch(f) };
  const payload = JSON.stringify({
    name: next.name, description: next.description, flow: next.flow,
    priority: next.priority, status: next.status,
    attachments: next.attachments, notes: next.notes,
  });
  return updateFeedbackMessage(id, payload);
}

export function setFeatureStatus(id: string, status: FeatureStatus) {
  return patchFeature(id, () => ({ status }));
}
export function setFeaturePriority(id: string, priority: Priority) {
  return patchFeature(id, () => ({ priority }));
}
export function addFeatureNote(id: string, by: string, text: string) {
  return patchFeature(id, (f) => ({ notes: [...f.notes, { by, at: new Date().toISOString(), text }] }));
}
