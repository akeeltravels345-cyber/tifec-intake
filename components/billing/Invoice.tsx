import type { InvoiceData } from "@/lib/invoice";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Invoice({ inv, printedAt }: { inv: InvoiceData; printedAt: string }) {
  return (
    <div className="inv-sheet">
      <header className="inv-head">
        <div className="inv-from">
          <div className="inv-brandrow">
            <img className="inv-logo" src="/tifec-mark.png" alt="" />
            <div className="inv-pname">{inv.practice.name}</div>
          </div>
          <div className="inv-paddr">
            {inv.practice.addressLines.map((l, i) => <div key={i}>{l}</div>)}
            {inv.practice.phone && <div>{inv.practice.phone}</div>}
            {inv.practice.email && <div>{inv.practice.email}</div>}
            {inv.practice.website && <div>{inv.practice.website}</div>}
          </div>
        </div>
        <div className="inv-headright">
          <div className="inv-word">Invoice</div>
          <div className="inv-meta">
            <div><span>No.</span><span>{inv.number}</span></div>
            <div><span>Issued</span><span>{inv.issueDate}</span></div>
            {inv.dueDate && <div><span>Due</span><span>{inv.dueDate}</span></div>}
          </div>
        </div>
      </header>

      <section className="inv-billto">
        <div className="inv-lab">Billed to</div>
        <div className="inv-billname">{inv.billTo.name}</div>
        {inv.billTo.lines.map((l, i) => <div key={i} className="inv-billline">{l}</div>)}
      </section>

      <table className="inv-tbl">
        <thead>
          <tr>
            <th className="inv-cdate">Date of service</th>
            <th className="inv-cdesc">Description</th>
            <th className="inv-cprov">Provider</th>
            <th className="inv-cnum">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}>
              <td className="inv-cdate">{l.date}</td>
              <td className="inv-cdesc">{l.description}</td>
              <td className="inv-cprov">{l.provider}</td>
              <td className="inv-cnum">{money(l.portion)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-totals">
        <div className="inv-trow"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
        <div className="inv-tdue"><span>Amount due</span><span>{money(inv.amountDue)}</span></div>
      </div>

      <section className="inv-notes">
        {inv.managingProvider && <div className="inv-mp">Managing provider: {inv.managingProvider}</div>}
        <div>Please settle this invoice within 30 days{inv.dueDate ? `, by ${inv.dueDate}` : ""}. Thank you for trusting us with your care.</div>
      </section>

      <footer className="inv-pagefoot">
        Invoice {inv.number} · {inv.clientName} · printed {printedAt}
      </footer>
    </div>
  );
}

export const INVOICE_CSS = `
.inv-page { background: #e9ecf1; padding: 20px 0 56px; }
.inv-bar { display: flex; align-items: center; gap: 12px; width: 210mm; max-width: 94vw; margin: 0 auto 16px; }
.inv-sheet {
  box-sizing: border-box; width: 210mm; max-width: 94vw; min-height: 297mm; margin: 0 auto;
  background: #fff; color: #1a1d24; padding: 22mm 20mm;
  font: 10.5pt/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  box-shadow: 0 6px 30px rgba(20,30,55,.10);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.inv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
  padding-bottom: 16px; border-bottom: 1px solid #1a1d24; margin-bottom: 26px; }
.inv-brandrow { display: flex; align-items: center; gap: 11px; }
.inv-logo { height: 38px; width: auto; display: block; }
.inv-pname { font-size: 15pt; font-weight: 600; letter-spacing: -.2px; }
.inv-paddr { margin-top: 6px; font-size: 8.7pt; line-height: 1.65; color: #5c636e; }
.inv-headright { text-align: right; white-space: nowrap; }
.inv-word { font-size: 17pt; font-weight: 400; letter-spacing: 5px; text-transform: uppercase; color: #1a1d24; }
.inv-meta { margin-top: 10px; display: inline-block; font-size: 9pt; }
.inv-meta > div { display: flex; justify-content: space-between; gap: 22px; padding: 2px 0; }
.inv-meta span:first-child { color: #8a909b; text-transform: uppercase; font-size: 7.6pt; letter-spacing: .6px; }
.inv-meta span:last-child { font-variant-numeric: tabular-nums; }
.inv-lab { font-size: 7.6pt; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #8a909b; margin-bottom: 5px; }
.inv-billto { margin-bottom: 24px; }
.inv-billname { font-size: 11pt; font-weight: 600; }
.inv-billline { font-size: 8.9pt; color: #5c636e; line-height: 1.55; }
.inv-tbl { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
.inv-tbl thead th { text-align: left; font-size: 7.8pt; font-weight: 600; letter-spacing: .6px;
  text-transform: uppercase; color: #8a909b; padding: 0 8px 8px; border-bottom: 1px solid #cfd4dc; }
.inv-tbl tbody td { padding: 9px 8px; font-size: 9.6pt; border-bottom: 1px solid #edeff3; vertical-align: top; }
.inv-tbl tbody tr:last-child td { border-bottom: 1px solid #cfd4dc; }
.inv-cnum { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.inv-cdate { white-space: nowrap; color: #5c636e; }
.inv-cprov { color: #5c636e; }
.inv-totals { width: 62mm; margin-left: auto; margin-bottom: 30px; }
.inv-trow { display: flex; justify-content: space-between; padding: 7px 8px; font-size: 9.6pt; color: #5c636e; font-variant-numeric: tabular-nums; }
.inv-tdue { display: flex; justify-content: space-between; padding: 10px 8px; margin-top: 2px;
  border-top: 1px solid #1a1d24; font-size: 11.5pt; font-weight: 700; font-variant-numeric: tabular-nums; }
.inv-notes { font-size: 8.9pt; color: #5c636e; line-height: 1.6; max-width: 120mm; }
.inv-mp { color: #1a1d24; font-weight: 600; margin-bottom: 5px; }
.inv-pagefoot { margin-top: 40px; padding-top: 12px; border-top: 1px solid #edeff3;
  font-size: 7.8pt; color: #a2a8b3; }

@media print {
  .inv-noprint, .bo-side, .bo-mobtabs, .tm-banner { display: none !important; }
  html, body, .bo-main, .biz { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .inv-page { background: #fff !important; padding: 0 !important; }
  .inv-sheet { box-shadow: none !important; width: auto !important; max-width: none !important;
    min-height: 0 !important; margin: 0 !important; padding: 0 !important; }
  @page { size: A4; margin: 18mm 16mm; }
}
`;
