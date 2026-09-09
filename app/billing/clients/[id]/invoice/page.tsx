import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { resolveClientInvoice } from "@/lib/invoiceServer";
import Invoice, { INVOICE_CSS } from "@/components/billing/Invoice";
import PrintButton from "@/components/billing/PrintButton";
import InvoiceEmail from "@/components/billing/InvoiceEmail";

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

  const res = await resolveClientInvoice(id, user, sessionsParam, isCopay);
  if (!res.ok) {
    if (res.status === 404) notFound();
    redirect("/billing/clients");
  }
  const { client, inv, itemCount, hasPracticeName } = res.data;

  const now = new Date();
  const printedAt = now.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const clientEmail = client.profile.email ?? "";

  // Preserve the exact selection this page was opened with, so the emailed PDF
  // covers the same visits as the one on screen.
  const query = new URLSearchParams();
  if (sessionsParam) query.set("sessions", sessionsParam);
  if (isCopay) query.set("type", "copay");
  const qs = query.toString();

  return (
    <div className="inv-page">
      <style dangerouslySetInnerHTML={{ __html: INVOICE_CSS }} />
      <div className="inv-bar inv-noprint">
        <Link href={isCopay ? "/billing/copays" : `/billing/clients/${id}`} className="ls-back">← Back to {isCopay ? "co-pays" : "client"}</Link>
        <div style={{ flex: 1 }} />
        {itemCount > 0 && (
          <>
            <InvoiceEmail
              clientId={id}
              query={qs}
              clientName={`${client.first} ${client.last}`}
              clientEmail={clientEmail}
              invoiceNo={inv.number}
              amountDue={inv.amountDue}
            />
            <PrintButton label="Print / Save PDF" className="bl-cta inv-noprint" />
          </>
        )}
      </div>

      {!hasPracticeName && (
        <div className="inv-bar inv-noprint" style={{ color: "#8a6d1a" }}>
          Add your practice name, address and contact details in <Link href="/billing/config" style={{ marginLeft: 4 }}>Setup</Link> so they print on the invoice header.
        </div>
      )}

      {itemCount === 0 ? (
        <div className="inv-bar inv-noprint">{isCopay ? "This client has no outstanding co-pays to invoice." : "This client has no self-pay sessions to invoice. Insured visits go on a CMS-1500 instead."}</div>
      ) : (
        <Invoice inv={inv} printedAt={printedAt} />
      )}
    </div>
  );
}
