import type { InvoiceData } from "@/lib/invoice";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Invoice({ inv, printedAt }: { inv: InvoiceData; printedAt: string }) {
  return (
    <div className="inv-sheet">
      <div className="inv-accent" />

      <header className="inv-top">
        <div className="inv-brand">
          <div className="inv-pname">{inv.practice.name}</div>
          <div className="inv-paddr">
            {inv.practice.addressLines.map((l, i) => <div key={i}>{l}</div>)}
            {inv.practice.phone && <div>{inv.practice.phone}</div>}
            {inv.practice.email && <div>{inv.practice.email}</div>}
            {inv.practice.website && <div>{inv.practice.website}</div>}
          </div>
        </div>
        <div className="inv-meta">
          <div className="inv-word">INVOICE</div>
          <div className="inv-num">#{inv.number}</div>
          <div className="inv-date">Date: {inv.issueDate}</div>
        </div>
      </header>

      <section className="inv-billto">
        <div className="inv-lab">Bill to</div>
        <div className="inv-billname">{inv.billTo.name}</div>
        {inv.billTo.lines.map((l, i) => <div key={i} className="inv-billline">{l}</div>)}
      </section>

      <table className="inv-tbl">
        <thead>
          <tr>
            <th className="inv-cdate">Date of service</th>
            <th className="inv-cdesc">Description</th>
            <th className="inv-cprov">Provider</th>
            <th className="inv-cnum">Fee</th>
            <th className="inv-cnum">Amount due</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}>
              <td className="inv-cdate">{l.date}</td>
              <td className="inv-cdesc">{l.description}</td>
              <td className="inv-cprov">{l.provider}</td>
              <td className="inv-cnum">{money(l.fee)}</td>
              <td className="inv-cnum">{money(l.portion)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-bottom">
        <div className="inv-notes">
          {inv.managingProvider && <div className="inv-mp">Managing provider: {inv.managingProvider}</div>}
          <div className="inv-pay">Please settle this invoice within 30 days. Thank you for trusting us with your care.</div>
        </div>
        <div className="inv-totals">
          <div className="inv-trow"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
          <div className="inv-due"><span>Amount due</span><b>{money(inv.amountDue)}</b></div>
        </div>
      </div>

      <footer className="inv-pagefoot">
        Invoice #{inv.number} · for {inv.clientName} · printed {printedAt}
      </footer>
    </div>
  );
}

export const INVOICE_CSS = `
.inv-page { background: #eef1f5; padding: 24px 0 60px; }
.inv-bar { display: flex; align-items: center; gap: 12px; max-width: 820px; margin: 0 auto 16px; padding: 0 16px; }
.inv-sheet {
  position: relative; max-width: 820px; margin: 0 auto; background: #fff; color: #1c2330;
  padding: 54px 56px 40px; border-radius: 10px; box-shadow: 0 10px 40px rgba(20,30,55,.12);
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.inv-accent { position: absolute; top: 0; left: 0; right: 0; height: 6px; border-radius: 10px 10px 0 0;
  background: linear-gradient(90deg, #2f2a6e, #3a6ea5); }
.inv-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 34px; }
.inv-pname { font-size: 22px; font-weight: 700; letter-spacing: -.2px; color: #1c2330; }
.inv-paddr { margin-top: 8px; font-size: 12.5px; color: #5b6472; line-height: 1.7; }
.inv-meta { text-align: right; white-space: nowrap; }
.inv-word { font-size: 26px; font-weight: 800; letter-spacing: 3px; color: #2f2a6e; }
.inv-num { margin-top: 4px; font-size: 15px; font-weight: 600; color: #1c2330; }
.inv-date { margin-top: 2px; font-size: 12.5px; color: #5b6472; }
.inv-billto { margin-bottom: 26px; }
.inv-lab { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #8a93a3; margin-bottom: 6px; }
.inv-billname { font-size: 15px; font-weight: 600; }
.inv-billline { font-size: 12.5px; color: #5b6472; line-height: 1.6; }
.inv-tbl { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
.inv-tbl thead th {
  text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
  color: #6b7280; padding: 10px 10px; border-bottom: 2px solid #2f2a6e;
}
.inv-tbl tbody td { padding: 12px 10px; font-size: 13.5px; border-bottom: 1px solid #eceef2; vertical-align: top; }
.inv-cnum { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.inv-cdate { white-space: nowrap; color: #5b6472; }
.inv-cdesc { font-weight: 500; }
.inv-cprov { color: #5b6472; }
.inv-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; margin-top: 6px; }
.inv-notes { flex: 1; font-size: 12.5px; color: #5b6472; }
.inv-mp { font-weight: 600; color: #1c2330; margin-bottom: 8px; }
.inv-pay { max-width: 340px; line-height: 1.6; }
.inv-totals { width: 260px; }
.inv-trow { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13.5px; color: #5b6472; }
.inv-due { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding: 14px 16px;
  background: #f3f4fb; border: 1px solid #dddef0; border-radius: 8px; }
.inv-due span { font-size: 13px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; color: #2f2a6e; }
.inv-due b { font-size: 20px; font-weight: 800; color: #1c2330; font-variant-numeric: tabular-nums; }
.inv-pagefoot { margin-top: 40px; padding-top: 14px; border-top: 1px solid #eceef2; font-size: 11px; color: #9aa2b1; text-align: center; }

@media print {
  .inv-noprint, .bo-side, .bo-mobtabs, .tm-banner { display: none !important; }
  body, .bo-main { margin: 0 !important; padding: 0 !important; }
  .inv-page { background: #fff !important; padding: 0 !important; }
  .inv-sheet { box-shadow: none !important; border-radius: 0 !important; max-width: none !important; margin: 0 !important; padding: 28px 32px !important; }
  @page { margin: 14mm; }
}
`;
