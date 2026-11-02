// =============================================================================
// Client merge (duplicate cleanup). Combines several client records that are the
// same person into one surviving record WITHOUT losing anything: every session,
// stored document and appointment is repointed to the survivor, the profiles and
// clinician links are unioned, and the duplicate rows are removed. The detection
// that proposes these merges lives in lib/clients.ts (findDuplicateGroups).
//
// Order matters: reassign the child rows (sessions, docs, appointments) while the
// duplicate ids still exist, THEN fold the client rows together and delete them.
// =============================================================================

import { mergeClientRecords, getClient } from "./clients";
import { reassignSessionsClient } from "./billing";
import { reassignDocsClient } from "./clientDocs";
import { reassignAppointmentsClient } from "./scheduling";
import { logChange } from "./db";

export interface MergeResult {
  ok: true;
  survivorId: string;
  merged: number;        // duplicate records folded in
  movedSessions: number;
  movedDocs: number;
  movedAppts: number;
}

export async function mergeClients(
  survivorId: string,
  duplicateIds: string[],
  actor: { id: string; name: string },
): Promise<MergeResult> {
  const dups = [...new Set(duplicateIds)].filter((id) => id && id !== survivorId);
  const survivor = await getClient(survivorId);
  if (!survivor) throw new Error("The record to keep no longer exists.");
  if (!dups.length) return { ok: true, survivorId, merged: 0, movedSessions: 0, movedDocs: 0, movedAppts: 0 };

  let movedSessions = 0, movedDocs = 0, movedAppts = 0;
  for (const d of dups) {
    movedSessions += await reassignSessionsClient(d, survivorId);
    movedDocs += await reassignDocsClient(d, survivorId);
    movedAppts += await reassignAppointmentsClient(d, survivorId);
  }

  const { merged } = await mergeClientRecords(survivorId, dups);

  await logChange(
    actor.id,
    `client:${survivorId}`,
    "status",
    `merged ${merged.length} duplicate client record${merged.length === 1 ? "" : "s"} into this one `
    + `(moved ${movedSessions} session${movedSessions === 1 ? "" : "s"}, ${movedDocs} document${movedDocs === 1 ? "" : "s"}, `
    + `${movedAppts} appointment${movedAppts === 1 ? "" : "s"})`,
  );

  return { ok: true, survivorId, merged: merged.length, movedSessions, movedDocs, movedAppts };
}
