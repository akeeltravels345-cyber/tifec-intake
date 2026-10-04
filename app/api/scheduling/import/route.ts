import { NextResponse } from "next/server";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, CLINICIANS } from "@/lib/clinicians";
import { listAppointmentTypes, importAppointment } from "@/lib/scheduling";
import { parseAcuityCsv, normalizeTypeKey } from "@/lib/acuityImport";

export const dynamic = "force-dynamic";

// Imports appointments from an Acuity CSV export. Admin / practice owner only
// (or a bearer SCHED_IMPORT_SECRET for scripted one-off imports). Idempotent:
// each Acuity appointment maps to a stable id ("acuity-<id>"), so re-running
// updates rather than duplicates. Never sends email or creates video links.
async function authorize(req: Request): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const secret = process.env.SCHED_IMPORT_SECRET;
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && bearer && bearer === secret) return { ok: true };
  const user = await getBillingUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isSystemAdmin(user.clinician) && user.clinician.contact !== "owner") {
    return { ok: false, res: NextResponse.json({ error: "Not permitted." }, { status: 403 }) };
  }
  return { ok: true };
}

const fmtCayman = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Cayman", weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
};

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;

  let body: { csv?: string; clinicianId?: string; commit?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON { csv, clinicianId?, commit? }." }, { status: 400 }); }
  if (!body.csv || typeof body.csv !== "string") return NextResponse.json({ error: "Missing csv." }, { status: 400 });

  const rows = parseAcuityCsv(body.csv);
  const types = await listAppointmentTypes();
  const typeByKey = new Map(types.map((t) => [normalizeTypeKey(t.name), t]));
  const clinByName = new Map(CLINICIANS.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const targetClinician = body.clinicianId || null;
  const commit = body.commit === true;

  const preview: Array<Record<string, unknown>> = [];
  const unmatchedTypes = new Set<string>();
  const skipped: Array<{ acuityId: string; reason: string }> = [];
  let created = 0, updated = 0;

  for (const row of rows) {
    const clinicianId = clinByName.get(row.calendarName.trim().toLowerCase()) || null;
    if (!clinicianId) { skipped.push({ acuityId: row.acuityId, reason: `unknown calendar: ${row.calendarName}` }); continue; }
    if (targetClinician && clinicianId !== targetClinician) continue; // filtered out, not an error
    if (!row.startAt || !row.endAt) { skipped.push({ acuityId: row.acuityId, reason: "unparseable date" }); continue; }

    const matchedType = typeByKey.get(normalizeTypeKey(row.typeName)) || null;
    if (!matchedType) unmatchedTypes.add(row.typeName);
    const mode = matchedType ? matchedType.mode : (/online|virtual/i.test(row.typeName) ? "virtual" : "in_person");

    const noteParts = [row.notes, row.phone ? `Phone: ${row.phone}` : ""].filter(Boolean);
    const stableId = `acuity-${row.acuityId}`;

    preview.push({
      when: fmtCayman(row.startAt), client: row.clientName, type: row.typeName,
      matchedType: matchedType ? matchedType.name : null, mode,
      hasLink: !!row.meetLink, acuityId: row.acuityId,
    });

    if (commit) {
      const r = await importAppointment(stableId, {
        kind: "appointment", clinicianId, clientName: row.clientName, clientEmail: row.clientEmail,
        typeId: matchedType ? matchedType.id : null, title: matchedType ? "" : row.typeName,
        startAt: row.startAt, endAt: row.endAt, mode: mode as "in_person" | "virtual",
        locationOrLink: row.meetLink, status: "booked", intakeStatus: "not_required",
        notes: noteParts.join(" · "), source: "staff", createdBy: "acuity-import",
      });
      if (r.created) created++; else updated++;
    }
  }

  return NextResponse.json({
    ok: true, commit, totalConsidered: rows.length, matched: preview.length,
    created, updated, skipped, unmatchedTypes: [...unmatchedTypes], preview,
  });
}
