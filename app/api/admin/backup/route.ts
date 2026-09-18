import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { listAllClients } from "@/lib/clients";
import { listSessions, listInsurers, listCptCodes, listClinicianSettings } from "@/lib/billing";
import { listNotesForClients, NOTE_FORMATS } from "@/lib/sessionNotes";
import { listTickets, listEmailLog } from "@/lib/comms";
import { caymanToday } from "@/lib/caymanTime";

export const dynamic = "force-dynamic";

// PLAIN-READABLE data export. Decrypts the practice's data into an Excel workbook
// (one sheet per table) so it can be opened and read directly. This is a full PHI
// export in clear text, so it is SYSTEM-ADMIN ONLY and must be handled carefully.
export async function GET() {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isSystemAdmin(user.clinician)) {
    return NextResponse.json({ error: "Only the system administrator can export the data." }, { status: 403 });
  }

  const nm = (id: string | null | undefined) => (id ? getClinician(id)?.name ?? id : "");
  const join = (xs: (string | undefined | null)[], sep = " ") => xs.filter(Boolean).join(sep);

  const [clients, sessions, insurers, cpt, settings, tickets, emails] = await Promise.all([
    listAllClients(), listSessions(), listInsurers(), listCptCodes(), listClinicianSettings(), listTickets(), listEmailLog(1000),
  ]);
  const insName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? (id ? "Unknown" : "Self-pay");
  const clientName = new Map(clients.map((c) => [c.id, `${c.last}, ${c.first}`]));
  const notes = await listNotesForClients(clients.map((c) => c.id));

  // ---- Clients (identity + insurance + referral + funds, flattened) ----
  const clientRows = clients.map((c) => {
    const p = c.profile;
    const a = p.address;
    const r = p.referral;
    return {
      "Last name": c.last, "First name": c.first,
      "Date of birth": p.dob ?? "", Sex: p.sex ?? "",
      Phone: p.phone ?? "", Email: p.email ?? "",
      Address: join([a?.line1, a?.line2, join([a?.city, a?.region, a?.postal], " "), a?.country], ", "),
      "Usual insurer": insName(c.insurerId),
      "Member/ID no.": p.insurance?.memberId ?? "", "Group no.": p.insurance?.groupNo ?? "",
      "Plan name": p.insurance?.planName ?? "", "Relationship to insured": p.insurance?.relationship ?? "self",
      "Insured name": join([p.insurance?.insuredFirst, p.insurance?.insuredLast]),
      "Insured DOB": p.insurance?.insuredDob ?? "",
      "Referral from": r?.source ?? "", "Referral valid from": r?.startDate ?? "",
      "Referral valid for (months)": r?.months ?? "", "Referral ends": r?.endDate ?? "",
      "Referral sessions": r?.sessions ?? "",
      "Deductible amount": p.deductible?.amount ?? "", "Deductible year": p.deductible?.year ?? "",
      "Insurance funds total": p.benefit?.amount ?? "", "Insurance funds year": p.benefit?.year ?? "",
      Diagnoses: (p.diagnosis ?? []).join("; "),
      Clinicians: c.clinicianIds.map(nm).join("; "),
      "Client since": c.createdAt?.slice(0, 10) ?? "",
    };
  });

  // ---- Charges / sessions ----
  const chargeRows = sessions.map((s) => ({
    "Date of service": s.dateOfService,
    Client: s.clientId ? clientName.get(s.clientId) ?? join([s.clientLast, s.clientFirst], ", ") : join([s.clientLast, s.clientFirst], ", "),
    Clinician: nm(s.clinicianId),
    Insurer: insName(s.insurerId),
    "CPT codes": (s.cptCodes ?? []).join(", "),
    Fee: s.totalCost,
    "Co-pay due": s.copayDue, "Co-pay collected": s.copayCollected,
    Status: s.insuranceDisposition ? s.insuranceDisposition : s.insurancePaid ? "collected" : s.billedDate ? "awaiting payment" : s.insurerId ? "to bill" : "self-pay",
    "Self-pay status": s.selfPayStatus ?? "",
    "Billed date": s.billedDate ?? "", "Paid date": s.paidDate ?? "",
    "Insurance collected (if adjusted)": s.insuranceCollected ?? "",
    "Biller note": s.billNote ?? "", Logged: s.createdAt?.slice(0, 10) ?? "",
  }));

  // ---- Session notes (clinical, decrypted) ----
  const noteRows = notes.map((n) => {
    const fmt = NOTE_FORMATS[n.content.format];
    const body = fmt.fields.map((f) => `${f.label}: ${n.content.fields[f.key] ?? ""}`).join("\n");
    return {
      Client: clientName.get(n.clientId) ?? n.clientId,
      Clinician: nm(n.clinicianId), "Session date": n.noteDate,
      Format: fmt.label, Note: body, Updated: n.updatedAt?.slice(0, 10) ?? "",
    };
  });

  // ---- Reference tables ----
  const insurerRows = insurers.map((i) => ({ Insurer: i.name, "Co-pay type": i.copayType ?? "", "Co-pay rate": i.copayRate ?? "", "Claim code": i.claimCode ?? "", Active: i.active ? "yes" : "no" }));
  const cptRows = cpt.map((c) => ({ Code: c.code, Description: c.description, Fee: c.fee ?? "", Active: c.active ? "yes" : "no" }));
  const settingRows = settings.map((s) => ({ Clinician: nm((s as { clinicianId?: string }).clinicianId ?? ""), ...s }));
  const ticketRows = tickets.map((t) => ({ Ref: t.ref, Subject: t.subject, Area: t.area, From: nm(t.createdBy), For: (t.assignees ?? []).map(nm).join("; "), Status: t.status, Detail: t.body, Raised: t.createdAt?.slice(0, 10) ?? "", Updated: t.updatedAt?.slice(0, 10) ?? "" }));
  const emailRows = emails.map((e) => ({ When: e.createdAt?.slice(0, 16).replace("T", " ") ?? "", Type: e.kind, Recipient: nm(e.recipientId), Email: e.recipientEmail, Status: e.status, Detail: e.detail }));

  const readme = [
    ["TIFEC — Cayman Essential Care: data export"],
    [`Generated: ${new Date().toISOString()} (Cayman date ${caymanToday()})`],
    [`Exported by: ${user.clinician.name}`],
    [],
    ["SENSITIVE: this file contains clients' personal and clinical data in plain, readable text."],
    ["Store it securely (encrypted drive), never email it, and delete old copies you don't need."],
    [],
    ["Sheets included:", "Clients, Charges, Session notes, Insurers, CPT codes, Clinician settings, Tickets, Email log"],
    [`Counts:`, `${clientRows.length} clients, ${chargeRows.length} charges, ${noteRows.length} notes, ${ticketRows.length} tickets`],
  ];

  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: object[] | unknown[][], aoa = false) => {
    const ws = aoa ? XLSX.utils.aoa_to_sheet(rows as unknown[][]) : XLSX.utils.json_to_sheet(rows as object[]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };
  add("READ ME", readme, true);
  add("Clients", clientRows);
  add("Charges", chargeRows);
  add("Session notes", noteRows);
  add("Insurers", insurerRows);
  add("CPT codes", cptRows);
  add("Clinician settings", settingRows);
  add("Tickets", ticketRows);
  add("Email log", emailRows);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tifec-backup-${caymanToday()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
