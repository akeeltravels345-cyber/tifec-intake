import Link from "next/link";
import { caymanToday } from "@/lib/caymanTime";
import { redirect, notFound } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listSessions, getPracticeConfig, listExternalClinicians, listCptCodes } from "@/lib/billing";
import { getClient, clinicianSeesClient } from "@/lib/clients";
import { getClinician } from "@/lib/clinicians";
import { uncollectedCopay } from "@/lib/billingCalc";
import { buildInvoice } from "@/lib/invoice";
import Invoice, { INVOICE_CSS } from "@/components/billing/Invoice";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sessions?: string; type?: string }>;
}) {
  const { id } = await params;
  const { sessions: sessionsParam, type } = await searchParams;
  const isCopay = type === "copay";
  const user = await getBillingUser();
  if (!user) redirect(`/login?next=/billing/clients/${id}/invoice`);

  const client = await getClient(id);
  if (!client) notFound();

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id))) redirect("/billing/clients");

  const [cptCodes, cfg, external, allForClient] = await Promise.all([
    listCptCodes(), getPracticeConfig(), listExternalClinicians(),
    seesAll ? listSessions({ clientId: id }) : listSessions({ clientId: id, clinicianId: user.clinician.id }),
  ]);

  // Two kinds of invoice:
  //  • self-pay (default) — a visit with no insurer, billed at the full fee.
  //  • co-pay — an insured visit whose co-pay was due but not collected, so the
  //    clinician can send the client a bill to chase just the outstanding co-pay.
  let items = isCopay
    ? allForClient.filter((s) => s.insurerId && uncollectedCopay(s) > 0)
    : allForClient.filter((s) => !s.insurerId);
  const wantIds = (sessionsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (wantIds.length) {
    const want = new Set(wantIds);
    items = items.filter((s) => want.has(s.id));
  }

  const prov = cfg.provider ?? {};
  const now = new Date();
  const issueDate = caymanToday();
  const printedAt = now.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const inv = buildInvoice(client, items, prov, issueDate, {
    clinName: (cid) => getClinician(cid)?.name ?? external.find((c) => c.id === cid)?.name ?? cid,
    clinCredentials: (cid) => getClinician(cid)?.credentials ?? "",
    cptDesc: (code) => cptCodes.find((c) => c.code === code)?.description ?? "",
  }, isCopay ? { portionOf: uncollectedCopay, descriptionPrefix: "Co-pay — " } : {});

  return (
    <div className="inv-page">
      <style dangerouslySetInnerHTML={{ __html: INVOICE_CSS }} />
      <div className="inv-bar inv-noprint">
        <Link href={isCopay ? "/billing/copays" : `/billing/clients/${id}`} className="ls-back">← Back to {isCopay ? "co-pays" : "client"}</Link>
        <div style={{ flex: 1 }} />
        {items.length > 0 && <PrintButton label="Print / Save PDF" className="bl-cta inv-noprint" />}
      </div>

      {!prov.practiceName && (
        <div className="inv-bar inv-noprint" style={{ color: "#8a6d1a" }}>
          Add your practice name, address and contact details in <Link href="/billing/config" style={{ marginLeft: 4 }}>Setup</Link> so they print on the invoice header.
        </div>
      )}

      {items.length === 0 ? (
        <div className="inv-bar inv-noprint">{isCopay ? "This client has no outstanding co-pays to invoice." : "This client has no self-pay sessions to invoice. Insured visits go on a CMS-1500 instead."}</div>
      ) : (
        <Invoice inv={inv} printedAt={printedAt} />
      )}
    </div>
  );
}
