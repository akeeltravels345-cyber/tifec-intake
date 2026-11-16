// =============================================================================
// Business continuity pack — a plain, printable snapshot (schedule + client/claim
// essentials + who-owes + reference data) so the practice can keep seeing clients
// and billing if the portal is down. Shared by the admin download endpoint and
// the weekly backup cron. Full PHI in clear text — callers gate access.
// =============================================================================
import { getClinician, CLINICIANS, canTreatClients } from "./clinicians";
import { listAllClients } from "./clients";
import { listSessions, listInsurers, listCptCodes, listExternalClinicians } from "./billing";
import { listAppointments, listAppointmentTypes } from "./scheduling";
import { selfPayOutstanding } from "./billingCalc";
import { caymanToday, caymanWhen } from "./caymanTime";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const money = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Build the full continuity-pack HTML document (self-contained, printable). */
export async function buildContinuityHtml(): Promise<string> {
  const now = Date.now();
  const from = new Date(now - 12 * 3600e3).toISOString();           // include earlier today
  const to = new Date(now + 21 * 24 * 3600e3).toISOString();        // next three weeks

  const [clients, sessions, insurers, cpt, external, appts, apptTypes] = await Promise.all([
    listAllClients(), listSessions(), listInsurers(), listCptCodes(), listExternalClinicians(),
    listAppointments({ from, to }), listAppointmentTypes(),
  ]);

  const clinName = (id: string) => getClinician(id)?.name ?? external.find((c) => c.id === id)?.name ?? id;
  const insName = (id: string | null) => (id ? insurers.find((i) => i.id === id)?.name ?? "Unknown" : "Self-pay");
  const typeName = (id: string | null) => (id ? apptTypes.find((t) => t.id === id)?.name ?? "" : "");
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const owedByClient = new Map<string, number>();
  for (const s of sessions) {
    const o = selfPayOutstanding(s);
    if (o > 0 && s.clientId) owedByClient.set(s.clientId, (owedByClient.get(s.clientId) ?? 0) + o);
  }
  const unbilled = sessions.filter((s) => s.insurerId && !s.billedDate);
  const unbilledTotal = unbilled.reduce((t, s) => t + (s.totalCost || 0), 0);

  const td = (v: unknown, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${esc(v)}</td>`;
  const table = (heads: string[], rows: string[]) =>
    `<table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${heads.length}" class="muted">None.</td></tr>`}</tbody></table>`;

  // ---- 1. Schedule (next 21 days), grouped by Cayman date ----
  const liveAppts = appts.filter((a) => a.kind === "appointment" && a.status !== "cancelled");
  const byDay = new Map<string, typeof liveAppts>();
  for (const a of liveAppts) {
    const day = caymanWhen(a.startAt).split(",").slice(0, 2).join(",").trim();
    const arr = byDay.get(day) ?? []; arr.push(a); byDay.set(day, arr);
  }
  const scheduleHtml = liveAppts.length === 0
    ? `<p class="muted">No appointments in the next three weeks.</p>`
    : [...byDay.entries()].map(([day, as]) =>
        `<h3>${esc(day)}</h3>` + table(
          ["Time", "Client", "Clinician", "Service", "Where", "Phone", "Email"],
          as.map((a) => {
            const time = (caymanWhen(a.startAt).match(/\d{1,2}:\d{2}\s*[AP]M/i) || [""])[0];
            const phone = a.clientId ? clientById.get(a.clientId)?.profile.phone ?? "" : "";
            return `<tr>${td(time)}${td(a.clientName || "(no name)")}${td(clinName(a.clinicianId))}${td(typeName(a.typeId))}${td(a.locationOrLink || (a.mode === "virtual" ? "Virtual" : a.mode === "in_person" ? "In person" : ""))}${td(phone)}${td(a.clientEmail)}</tr>`;
          }),
        ),
      ).join("");

  // ---- 2. Client directory ----
  const dirRows = [...clients]
    .sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`))
    .map((c) => {
      const p = c.profile;
      const owed = owedByClient.get(c.id) ?? 0;
      const guardian = p.guardian?.name ? `${p.guardian.name}${p.guardian.relationship ? ` (${p.guardian.relationship})` : ""}` : "";
      return `<tr>${td(`${c.last}, ${c.first}`)}${td(p.dob ?? "")}${td(p.sex ?? "")}${td(p.phone ?? "")}${td(p.email ?? "")}${td(insName(c.insurerId))}${td(p.insurance?.memberId ?? "")}${td(p.insurance?.groupNo ?? "")}${td(guardian)}${td(p.referral?.endDate ?? "")}${td(owed ? money(owed) : "", "num")}</tr>`;
    });
  const dirHtml = table(
    ["Client", "DOB", "Sex", "Phone", "Email", "Insurer", "Member ID", "Group", "Guardian (payer)", "Referral ends", "Owes"],
    dirRows,
  );

  // ---- 3. Who owes money ----
  const owesRows = [...owedByClient.entries()]
    .map(([id, amt]) => ({ c: clientById.get(id), amt }))
    .filter((x) => x.c)
    .sort((a, b) => b.amt - a.amt)
    .map((x) => `<tr>${td(`${x.c!.last}, ${x.c!.first}`)}${td(x.c!.profile.phone ?? "")}${td(x.c!.profile.email ?? "")}${td(money(x.amt), "num")}</tr>`);
  const owesTotal = [...owedByClient.values()].reduce((t, n) => t + n, 0);
  const owesHtml = table(["Client", "Phone", "Email", "Owes"], owesRows) +
    `<p class="total">Total owed by clients: <b>${money(owesTotal)}</b></p>`;

  // ---- reference ----
  const clinRows = CLINICIANS.filter(canTreatClients).map((c) => `<tr>${td(c.name)}${td(c.email ?? "")}${td(c.credentials ?? "")}</tr>`);
  const insRows = insurers.filter((i) => i.active !== false).map((i) => `<tr>${td(i.name)}${td(i.email ?? "")}${td(i.copayType === "none" ? "None" : i.copayType === "fixed" ? money(i.copayRate) : `${i.copayRate}%`)}${td(i.claimCode ?? "")}${td(i.billStyle === "invoice" ? "Invoice" : "CMS-1500")}</tr>`);
  const cptRows = cpt.filter((c) => c.active !== false).map((c) => `<tr>${td(c.code)}${td(c.description ?? "")}${td(money(c.fee ?? 0), "num")}</tr>`);

  const generated = caymanWhen(new Date().toISOString());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Business continuity pack — ${caymanToday()}</title>
<style>
  :root{color-scheme:light;}
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2330;background:#fff;margin:0;padding:0 28px 60px;}
  .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 0;margin-bottom:8px;display:flex;gap:14px;align-items:center;}
  button{font:600 14px inherit;padding:9px 16px;border:0;border-radius:8px;background:#2e3192;color:#fff;cursor:pointer;}
  h1{font-size:24px;margin:14px 0 2px;} h2{font-size:18px;margin:28px 0 8px;border-top:2px solid #2e3192;padding-top:14px;}
  h3{font-size:14px;margin:16px 0 4px;color:#444;}
  .sub{color:#5b6472;margin:0 0 6px;max-width:760px;}
  table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:12.5px;}
  th{text-align:left;background:#f3f4f8;border:1px solid #e5e7eb;padding:6px 8px;font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:#5b6472;}
  td{border:1px solid #eceef2;padding:5px 8px;vertical-align:top;}
  td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  .muted{color:#8a929e;} .total{font-size:14px;margin:4px 0 0;} tbody tr:nth-child(even) td{background:#fafbfc;}
  .stat{display:inline-block;margin:0 24px 8px 0;} .stat b{font-size:20px;display:block;}
  @media print{.bar{display:none;} body{padding:0;} tr{break-inside:avoid;} a{color:inherit;text-decoration:none;}}
</style></head>
<body>
  <div class="bar"><button onclick="window.print()">Print / Save as PDF</button><span class="muted">Generated ${esc(generated)} (Cayman). Full client details — keep secure.</span></div>
  <h1>Business continuity pack</h1>
  <p class="sub">The Institute for Essential Care. If the portal is unavailable, this is everything needed to keep seeing clients and billing: the schedule, every client's contact and insurance details, who owes money, what still needs claiming, and the rates to build claims by hand.</p>
  <div>
    <span class="stat"><b>${liveAppts.length}</b>appointments (next 21 days)</span>
    <span class="stat"><b>${clients.length}</b>clients on file</span>
    <span class="stat"><b>${money(owesTotal)}</b>owed by clients</span>
    <span class="stat"><b>${unbilled.length}</b>sessions not yet billed (${money(unbilledTotal)})</span>
  </div>

  <h2>1. Schedule — next 21 days</h2>
  ${scheduleHtml}

  <h2>2. Client directory (${clients.length})</h2>
  ${dirHtml}

  <h2>3. Who owes money (self-pay balances)</h2>
  ${owesHtml}

  <h2>4. Insured work not yet billed</h2>
  <p class="sub">${unbilled.length} logged session${unbilled.length === 1 ? "" : "s"} totalling <b>${money(unbilledTotal)}</b> still need a CMS-1500 sent to the insurer.</p>
  ${table(["Date of service", "Client", "Clinician", "Insurer", "CPT", "Fee"], unbilled
    .sort((a, b) => a.dateOfService.localeCompare(b.dateOfService))
    .map((s) => `<tr>${td(s.dateOfService)}${td(s.clientId ? (clientById.get(s.clientId) ? `${clientById.get(s.clientId)!.last}, ${clientById.get(s.clientId)!.first}` : "") : `${s.clientLast}, ${s.clientFirst}`)}${td(clinName(s.clinicianId))}${td(insName(s.insurerId))}${td((s.cptCodes ?? []).join(", "))}${td(money(s.totalCost || 0), "num")}</tr>`))}

  <h2>5. Clinicians</h2>
  ${table(["Name", "Email", "Credentials"], clinRows)}

  <h2>6. Insurers (how to bill each payer)</h2>
  ${table(["Insurer", "Claims email", "Co-pay", "Claim code", "Bill by"], insRows)}

  <h2>7. Service fees</h2>
  ${table(["CPT code", "Description", "Fee"], cptRows)}
</body></html>`;
}
