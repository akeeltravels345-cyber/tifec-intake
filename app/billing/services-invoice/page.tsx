import Link from "next/link";
import { redirect } from "next/navigation";
import { caymanToday, caymanYearMonth } from "@/lib/caymanTime";
import { getBillingUser, canSeeBusiness } from "@/lib/billingRole";
import { getPracticeConfig, servicesInvoiceTotal } from "@/lib/billing";
import PrintButton from "@/components/billing/PrintButton";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The admin's fixed monthly SERVICES invoice (Akeel → the practice). Unlike the
// biller's commission statement (computed from collections), this is a flat agreed
// fee set in Setup. Owner + admin only (both carry the owner role).
export default async function ServicesInvoice({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/services-invoice");
  if (!canSeeBusiness(user.role)) redirect("/billing/me");

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;

  const cfg = await getPracticeConfig();
  const inv = cfg.servicesInvoice;
  const generated = caymanToday();
  const practiceName = cfg.provider?.practiceName || "The Institute for Essential Care";

  if (!inv || !inv.enabled || inv.lineItems.length === 0) {
    return (
      <div className="stmt-wrap">
        <div className="stmt-actions">
          <Link href={`/billing/overview?y=${year}&m=${month}`} className="bz-link">← Back</Link>
        </div>
        <article className="inv">
          <p style={{ color: "var(--muted)", padding: "24px 0" }}>
            No services invoice is set up yet. Add your line items in{" "}
            <Link href="/billing/config" className="bz-link">Setup → My services invoice</Link>.
          </p>
        </article>
      </div>
    );
  }

  const total = servicesInvoiceTotal(cfg);

  return (
    <div className="stmt-wrap">
      <div className="stmt-actions">
        <Link href={`/billing/overview?y=${year}&m=${month}`} className="bz-link">← Back</Link>
        <PrintButton />
      </div>

      <article className="inv">
        <header className="inv-head">
          <div className="inv-brand">
            <div className="inv-biz">{inv.businessName || inv.payeeName || "Services"}</div>
            <div className="inv-doc">Invoice</div>
          </div>
          <div className="inv-meta">
            <div>{generated}{inv.invoiceNumber ? ` · Invoice # ${inv.invoiceNumber}` : ""}</div>
            <div className="inv-period">Services for {MONTHS[month - 1]} {year} · KYD</div>
          </div>
        </header>

        <section className="inv-parties">
          <div>
            <div className="inv-label">Invoice to</div>
            <div className="inv-pname">{practiceName}</div>
            <div className="inv-psub">TIFEC</div>
          </div>
          <div>
            <div className="inv-label">From</div>
            <div className="inv-pname">{inv.payeeName || inv.businessName}</div>
          </div>
          <div>
            <div className="inv-label">Payment terms</div>
            <div className="inv-pname">{inv.terms || "Due on receipt"}</div>
          </div>
        </section>

        <table className="inv-tbl">
          <thead>
            <tr><th>Item</th><th>Description</th><th className="num">Price (KYD)</th></tr>
          </thead>
          <tbody>
            {inv.lineItems.map((l) => (
              <tr key={l.id}>
                <td className="inv-itnm">{l.description}</td>
                <td className="inv-itdt">{l.detail || ""}</td>
                <td className="num">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="inv-sub"><td colSpan={2}>Subtotal</td><td className="num">{money(total)}</td></tr>
            <tr><td colSpan={2}>Paid to date</td><td className="num">{money(0)}</td></tr>
            <tr className="inv-due"><td colSpan={2}>Balance due · due upon receipt</td><td className="num">KYD {money(total)}</td></tr>
          </tfoot>
        </table>

        {(inv.bankName || inv.accountNumber || inv.routingNumber) && (
          <section className="inv-pay">
            <div className="inv-label">Payment details</div>
            <div className="inv-paygrid">
              {inv.bankName && <div><span>Bank</span><b>{inv.bankName}</b></div>}
              {inv.accountNumber && <div><span>Account number</span><b>{inv.accountNumber}</b></div>}
              {inv.routingNumber && <div><span>Routing number</span><b>{inv.routingNumber}</b></div>}
              <div><span>Payee</span><b>{inv.payeeName || inv.businessName}</b></div>
            </div>
          </section>
        )}

        <footer className="inv-foot">
          <span>{(inv.businessName || "").toUpperCase()}{inv.payeeName ? ` · ${inv.payeeName.toUpperCase()}` : ""}</span>
          <span>Generated {generated}.</span>
        </footer>
      </article>
    </div>
  );
}
