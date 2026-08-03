// Shared feature worklist (Akeel + Nick). Stored on the existing `feedback`
// table under a reserved category, so there's no new migration — it works on
// live immediately and degrades gracefully if the table is ever missing.
import { insertFeedback, listFeedback } from "./feedback";

export type Priority = "nice" | "important" | "urgent";

export interface Feature {
  id: string;
  requestedBy: string; // clinician id
  name: string;
  description: string;
  flow: string;        // "starts … → ends …"
  priority: Priority;
  createdAt: string;   // ISO
}

const CATEGORY = "worklist";

export async function addFeature(
  requestedBy: string,
  f: { name: string; description: string; flow: string; priority: string }
): Promise<void> {
  const priority: Priority = f.priority === "urgent" || f.priority === "important" ? f.priority : "nice";
  const payload = JSON.stringify({ name: f.name.trim(), description: f.description.trim(), flow: f.flow.trim(), priority });
  await insertFeedback(CATEGORY, payload, requestedBy);
}

const RANK: Record<Priority, number> = { urgent: 0, important: 1, nice: 2 };

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
        createdAt: r.created_at,
      };
    });
  // Urgent first, then newest.
  return feats.sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.createdAt.localeCompare(a.createdAt));
}
