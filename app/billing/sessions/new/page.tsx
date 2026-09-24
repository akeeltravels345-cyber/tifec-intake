import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { listInsurers, listCptCodes, listSessions, cptVariantList } from "@/lib/billing";
import { listClients } from "@/lib/clients";
import { caymanToday } from "@/lib/caymanTime";
import { getAppointment, listAppointmentTypes } from "@/lib/scheduling";
import SessionForm from "@/components/billing/SessionForm";

export const dynamic = "force-dynamic";

const cayDate = (iso: string) => new Date(Date.parse(iso) - 5 * 3600e3).toISOString().slice(0, 10); // Cayman UTC-5

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ fromAppt?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/sessions/new");

  const [insurers, cptCodes, mySessions, roster] = await Promise.all([
    listInsurers(),
    listCptCodes(),
    listSessions({ clinicianId: user.clinician.id }),
    listClients(user.clinician.id),
  ]);
  const activeInsurers = insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, copayType: i.copayType, copayRate: i.copayRate }));
  const activeCpt = cptCodes.filter((c) => c.active).map((c) => { const vs = cptVariantList(c); return { code: c.code, description: c.description, fee: c.fee ?? 0, hrs: c.hrs ?? 1, variants: vs }; });

  // Distinct clients this clinician has seen before, most recent first, with the
  // insurer they last used — so a returning client is one click, not a re-type.
  const seen = new Map<string, { id: string | null; first: string; last: string; insurerId: string | null; lastVisit: string; visits: number; referralEnd: string | null }>();
  for (const s of [...mySessions].sort((a, b) => b.dateOfService.localeCompare(a.dateOfService))) {
    const first = s.clientFirst?.trim() ?? "", last = s.clientLast?.trim() ?? "";
    if (!first && !last) continue;
    const key = `${first}|${last}`.toLowerCase();
    const prev = seen.get(key);
    if (prev) { prev.visits += 1; if (!prev.id && s.clientId) prev.id = s.clientId; }
    // Sorted newest-first, so the first sighting carries their latest insurer.
    else seen.set(key, { id: s.clientId, first, last, insurerId: s.insurerId, lastVisit: s.dateOfService, visits: 1, referralEnd: null });
  }
  // Fold in imported clients who have no logged session yet, so they're
  // selectable too. Someone already seen via a session keeps that entry, but we
  // backfill the client-record id + referral end date from the roster.
  for (const c of roster) {
    const first = c.first?.trim() ?? "", last = c.last?.trim() ?? "";
    if (!first && !last) continue;
    const key = `${first}|${last}`.toLowerCase();
    const prev = seen.get(key);
    if (prev) { if (!prev.id) prev.id = c.id; prev.referralEnd = c.profile.referral?.endDate ?? null; }
    else seen.set(key, { id: c.id, first, last, insurerId: c.insurerId, lastVisit: "", visits: 0, referralEnd: c.profile.referral?.endDate ?? null });
  }
  const clients = [...seen.values()].sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`));

  // Which codes this clinician actually reaches for. Practice-wide only 5 of the
  // 39 codes have ever been used, so leading with their own habits beats a wall
  // of every code in the catalogue.
  const usage = new Map<string, number>();
  for (const s of mySessions) for (const c of s.cptCodes ?? []) usage.set(c, (usage.get(c) ?? 0) + 1);
  const usualCodes = [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);

  // Lets the form warn before logging a second session for the same client on
  // the same day — almost always a double-entry rather than a real second visit.
  const alreadyLogged = mySessions.map((s) =>
    `${`${s.clientFirst ?? ""}|${s.clientLast ?? ""}`.toLowerCase().trim()}@${s.dateOfService}`);

  const today = caymanToday();

  // Arrived from a scheduled appointment ("Log this session"): pre-fill from it
  // so the clinician confirms instead of retyping, and link back on save.
  const sp = await searchParams;
  let prefill: undefined | { appointmentId: string; first: string; last: string; dob?: string; clientId?: string | null; returning?: boolean; insurerId?: string | null; date?: string; notes?: string; codes?: string[]; serviceName?: string };
  if (sp.fromAppt) {
    const appt = await getAppointment(sp.fromAppt);
    if (appt && appt.kind === "appointment" && appt.billingSessionId) redirect("/schedule"); // already logged
    if (appt && appt.kind === "appointment") {
      const type = (await listAppointmentTypes()).find((t) => t.id === appt.typeId);
      const parts = appt.clientName.trim().split(/\s+/);
      const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] || appt.clientName);
      const last = parts.length > 1 ? parts[parts.length - 1] : "";
      const key = `${first}|${last}`.toLowerCase().trim();
      const match = clients.find((c) => `${c.first}|${c.last}`.toLowerCase().trim() === key);
      const insurerId = appt.insurancePath === "insurance" ? (appt.insurerId || match?.insurerId || null) : (match?.insurerId || null);
      prefill = {
        appointmentId: appt.id,
        first, last,
        clientId: match?.id ?? null,
        returning: !!match,
        insurerId,
        date: cayDate(appt.startAt),
        notes: appt.notes || "",
        codes: type?.baselineCptCodes ?? [],
        serviceName: type?.name,
      };
    }
  }

  return (
    <>
      <Link href={prefill ? "/schedule" : "/billing/me"} className="ls-back">← {prefill ? "Back to the calendar" : "Back to my payout"}</Link>
      <div className="ls-topbar">
        <h1 className="ls-h1">{prefill ? "Confirm this session" : "Log a session"}</h1>
        <p className="ls-sub">{prefill
          ? `${prefill.serviceName || "Session"} with ${prefill.first} ${prefill.last}${prefill.returning ? " (returning client)" : " (new client)"}. Check the details and save — it goes to the biller.`
          : `Logged as ${user.clinician.name}. Pick the service code(s) and the money fills in.`}</p>
      </div>
      <SessionForm insurers={activeInsurers} cptCodes={activeCpt} clients={clients} usualCodes={usualCodes} alreadyLogged={alreadyLogged} today={today} prefill={prefill} />
    </>
  );
}
