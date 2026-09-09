// =============================================================================
// Server-side glue for invoices. Loads a client + the sessions to bill and runs
// the pure builder, so the on-screen invoice page and the "email to client" API
// produce the exact same document from the exact same rules. Keep the selection
// logic here (nowhere else) so the two can never drift apart.
// =============================================================================

import { caymanToday } from "./caymanTime";
import { isBiller, isOwner, type BillingUser } from "./billingRole";
import { listSessions, getPracticeConfig, listExternalClinicians, listCptCodes } from "./billing";
import { getClient, clinicianSeesClient, type Client } from "./clients";
import { getClinician } from "./clinicians";
import { uncollectedCopay } from "./billingCalc";
import { buildInvoice, type InvoiceData } from "./invoice";

export interface ResolvedInvoice {
  client: Client;
  inv: InvoiceData;
  itemCount: number;
  isCopay: boolean;
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
): Promise<{ ok: true; data: ResolvedInvoice } | { ok: false; status: number; error: string }> {
  const client = await getClient(id);
  if (!client) return { ok: false, status: 404, error: "Client not found." };

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return { ok: false, status: 403, error: "Not allowed to view this client." };

  const [cptCodes, cfg, external, allForClient] = await Promise.all([
    listCptCodes(), getPracticeConfig(), listExternalClinicians(),
    seesAll ? listSessions({ clientId: id }) : listSessions({ clientId: id, clinicianId: user.clinician.id }),
  ]);

  // Self-pay (no insurer, full fee) vs co-pay (insured visit with an outstanding
  // co-pay, billed for just that piece).
  let items = isCopay
    ? allForClient.filter((s) => s.insurerId && uncollectedCopay(s) > 0)
    : allForClient.filter((s) => !s.insurerId);
  const wantIds = (sessionsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (wantIds.length) {
    const want = new Set(wantIds);
    items = items.filter((s) => want.has(s.id));
  }

  const prov = cfg.provider ?? {};
  const issueDate = caymanToday();
  const inv = buildInvoice(client, items, prov, issueDate, {
    clinName: (cid) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
    clinCredentials: (cid) => getClinician(cid)?.credentials ?? "",
    cptDesc: (code) => cptCodes.find((c) => c.code === code)?.description ?? "",
  }, isCopay ? { portionOf: uncollectedCopay, descriptionPrefix: "Co-pay: " } : {});

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
      client, inv, itemCount: items.length, isCopay, issueDate,
      hasPracticeName: Boolean(prov.practiceName),
      clinician,
    },
  };
}
