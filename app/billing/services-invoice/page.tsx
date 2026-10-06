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
  const payee = inv.payeeName || "Services";
  const mono = payee.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "AO";

  return (
    <div className="stmt-wrap">
      <div className="stmt-actions">
        <Link href={`/billing/overview?y=${year}&m=${month}`} className="bz-link">← Back</Link>
        <PrintButton />
      </div>

      <article className="inv">
        <div className="inv-band">
          <div className="inv-band-l">
            <div className="inv-mono">{mono}</div>
            <div>
              <div className="inv-biz">{payee}</div>
              <div className="inv-doc">Services Invoice</div>
            </div>
          </div>
          <div className="inv-band-r">
            {inv.invoiceNumber && <div className="inv-num">Invoice #{inv.invoiceNumber}</div>}
            <div className="inv-sub2">{generated}</div>
            <div className="inv-sub2">{MONTHS[month - 1]} {year} · KYD</div>
          </div>
        </div>

        <div className="inv-body">
          <section className="inv-parties">
            <div className="inv-party">
              <div className="inv-label">From</div>
              <div className="inv-pname">{inv.payeeName}</div>
            </div>
            <div className="inv-party">
              <div className="inv-label">Billed to</div>
              <div className="inv-pname">{practiceName}</div>
              <div className="inv-psub">TIFEC</div>
            </div>
            <div className="inv-party">
              <div className="inv-label">Terms</div>
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
                  <td className="num inv-amt">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="inv-totals">
            <div className="inv-trow"><span>Subtotal</span><b>{money(total)}</b></div>
            <div className="inv-trow"><span>Paid to date</span><b>{money(0)}</b></div>
            <div className="inv-balance">
              <span>Balance due</span>
              <b>KYD {money(total)}</b>
            </div>
            <div className="inv-duenote">Due upon receipt</div>
          </div>

          {(inv.bankName || inv.accountNumber || inv.routingNumber) && (
            <section className="inv-pay">
              <div className="inv-label">Payment details</div>
              <div className="inv-paygrid">
                {inv.bankName && <div><span>Bank</span><b>{inv.bankName}</b></div>}
                {inv.accountNumber && <div><span>Account number</span><b>{inv.accountNumber}</b></div>}
                {inv.routingNumber && <div><span>Routing number</span><b>{inv.routingNumber}</b></div>}
                <div><span>Payee</span><b>{inv.payeeName}</b></div>
              </div>
            </section>
          )}

          <footer className="inv-foot">
            <span>{(inv.payeeName || "").toUpperCase()}</span>
            <span>Generated {generated}</span>
          </footer>
        </div>
      </article>
    </div>
  );
}
