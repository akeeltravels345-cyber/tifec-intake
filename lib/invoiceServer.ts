// =============================================================================
// Server-side glue for invoices. Loads a client + the sessions to bill and runs
// the pure builder, so the on-screen invoice page and the "email to client" API
// produce the exact same document from the exact same rules. Keep the selection
// logic here (nowhere else) so the two can never drift apart.
// =============================================================================

import { caymanToday } from "./caymanTime";
import { isBiller, isOwner, type BillingUser } from "./billingRole";
import { listSessions, getPracticeConfig, listExternalClinicians, listCptCodes, listInsurers, assignInvoiceNumber } from "./billing";
import { getClient, clinicianSeesClient, type Client } from "./clients";
import { getClinician } from "./clinicians";
import { uncollectedCopay, selfPayOutstanding } from "./billingCalc";
import type { BillingSession } from "./billing";
import { buildInvoice, type InvoiceData } from "./invoice";

export interface ResolvedInvoice {
  client: Client;
  inv: InvoiceData;
  itemCount: number;
  isCopay: boolean;
  /** True when this is an invoice-style payer invoice (e.g. Ponciana Rehab):
   *  billed to the payer at full fee, with a sequential invoice number. */
  isPayer?: boolean;
  issueDate: string;
  hasPracticeName: boolean;
  /** The clinician who saw the client on this invoice (when it's a single
   *  provider). Their email is where the client's replies should go. */
  clinician?: { name?: string; email?: string };
}

/** Build the invoice for a client, honoring the same access rules and the same
 *  self-pay / co-pay selection the invoice page uses. Returns null (with a reason)
 *  when the caller may not see the client. `itemCount` of 0 means nothing to bill. */
export async function resolveClientInvoice(
  id: string,
  user: BillingUser,
  sessionsParam: string | undefined,
  isCopay: boolean,
  /** When set, build an invoice-style-payer invoice for this insurer id: sessions
   *  billed to that payer, at full fee, billed to the payer, with a sequential
   *  invoice number. Overrides isCopay. */
  payerId?: string,
): Promise<{ ok: true; data: ResolvedInvoice } | { ok: false; status: number; error: string }> {
  const client = await getClient(id);
  if (!client) return { ok: false, status: 404, error: "Client not found." };

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return { ok: false, status: 403, error: "Not allowed to view this client." };

  const [cptCodes, cfg, external, insurers, allForClient] = await Promise.all([
    listCptCodes(), getPracticeConfig(), listExternalClinicians(), listInsurers(),
    seesAll ? listSessions({ clientId: id }) : listSessions({ clientId: id, clinicianId: user.clinician.id }),
  ]);

  // What the client still owes on a self-pay visit: the full fee when it hasn't
  // been paid, or the remaining balance (fee minus what's already come in) once
  // it's marked "owing". A waived visit is forgiven, so it's billed at nothing.
  const selfPayPortion = (s: BillingSession) =>
    s.selfPayStatus === "owing" ? selfPayOutstanding(s) : (s.totalCost || 0);

  // The invoice-style payer (e.g. Ponciana Rehab), when this is a payer invoice.
  const payer = payerId ? insurers.find((x) => x.id === payerId) : undefined;
  if (payerId && !payer) return { ok: false, status: 404, error: "Payer not found." };

  // Payer invoice: sessions billed to that insurer, at full fee, billed to the
  // payer. Otherwise self-pay (no insurer, what the client still owes) vs co-pay
  // (insured visit with an outstanding co-pay, just that piece). Waived self-pay
  // is excluded — there's nothing left to bill.
  let items = payer
    ? allForClient.filter((s) => s.insurerId === payer.id)
    : isCopay
    ? allForClient.filter((s) => s.insurerId && uncollectedCopay(s) > 0)
    : allForClient.filter((s) => !s.insurerId && s.selfPayStatus !== "waived");
  const wantIds = (sessionsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (wantIds.length) {
    const want = new Set(wantIds);
    items = items.filter((s) => want.has(s.id));
  }

  const prov = cfg.provider ?? {};
  const issueDate = caymanToday();
  // A payer invoice gets a stamped sequential number and is billed to the payer.
  const payerNumber = payer && items.length ? await assignInvoiceNumber(items.map((s) => s.id)) : undefined;
  const buildOpts = payer
    ? { number: payerNumber != null ? String(payerNumber) : undefined, billTo: { name: payer.name, lines: [] as string[] } }
    : isCopay
    ? { portionOf: uncollectedCopay, descriptionPrefix: "Co-pay: " }
    : { portionOf: selfPayPortion };
  const inv = buildInvoice(client, items, prov, issueDate, {
    clinName: (cid) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
    clinCredentials: (cid) => getClinician(cid)?.credentials ?? "",
    cptDesc: (code) => cptCodes.find((c) => c.code === code)?.description ?? "",
  }, buildOpts);

  // The provider on this invoice — when every line is one clinician, their email
  // is the reply-to and the contact shown to the client.
  const providerIds = [...new Set(items.map((s) => s.clinicianId))];
  let clinician: { name?: string; email?: string } | undefined;
  if (providerIds.length === 1) {
    const c = getClinician(providerIds[0]);
    clinician = {
      name: c?.name ?? external.find((e) => e.id === providerIds[0])?.name,
      email: c?.email || undefined,
    };
  }

  return {
    ok: true,
    data: {
      client, inv, itemCount: items.length, isCopay, isPayer: Boolean(payer), issueDate,
      hasPracticeName: Boolean(prov.practiceName),
      clinician,
    },
  };
}
