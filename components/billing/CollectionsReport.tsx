"use client";

export interface CollRow {
  client: string;
  dateOfService: string;
  paidDate: string | null;
  insurer: string;
  cpt: string;
  amount: number;
  fromThisMonth: boolean;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const byClientThenDate = (a: CollRow, b: CollRow) => a.client.localeCompare(b.client) || a.dateOfService.localeCompare(b.dateOfService);

// A printable, per-clinician "insurance collected in <month>" report — the same
// data as the on-screen breakdown, split into this-month vs earlier visits, for
// reconciling against the insurers' own payment reports.
export default function CollectionsReport({ rows, clinicianName, monthLabel, practiceName, thisMonth, prior, total, asOf }: {
  rows: CollRow[]; clinicianName: string; monthLabel: string; practiceName: string;
  thisMonth: number; prior: number; total: number; asOf: string;
}) {
  const thisRows = rows.filter((r) => r.fromThisMonth).sort(byClientThenDate);
  const priorRows = rows.filter((r) => !r.fromThisMonth).sort(byClientThenDate);

  const table = (list: CollRow[]) => (
    <table className="ac-tbl">
      <thead>
        <tr><th>Client</th><th>Visit date</th><th>Paid</th><th>Insurer</th><th>Service</th><th className="num">Amount</th></tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={6} className="ac-empty">None.</td></tr>
        ) : list.map((r, i) => (
          <tr key={i}>
            <td className="ac-nm">{r.client}</td>
            <td>{r.dateOfService}</td>
            <td>{r.paidDate ?? ""}</td>
            <td>{r.insurer}</td>
            <td>{r.cpt || ""}</td>
            <td className="num">{money(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="ac-wrap">
      <div className="ac-bar ac-noprint">
        <div style={{ flex: 1 }} />
        <button type="button" className="bl-cta ac-print" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="ac-sheet">
        <header className="ac-head">
          <div>
            <div className="ac-practice">{practiceName}</div>
            <div className="ac-sub">Insurance collected in {monthLabel}</div>
          </div>
          <div className="ac-headright">
            <div className="ac-insurer">{clinicianName}</div>
            <div className="ac-asof">By the visit each payment was for &middot; as of {asOf}</div>
          </div>
        </header>

        <div className="ac-summary col-3">
          <div className="ac-sumcell"><div className="ac-sumk">From this month&apos;s visits</div><div className="ac-sumv">{money(thisMonth)}</div><div className="ac-sumc">{thisRows.length} {thisRows.length === 1 ? "payment" : "payments"}</div></div>
          <div className="ac-sumcell"><div className="ac-sumk">From earlier months&apos; visits</div><div className="ac-sumv">{money(prior)}</div><div className="ac-sumc">{priorRows.length} {priorRows.length === 1 ? "payment" : "payments"}</div></div>
          <div className="ac-sumcell col-tot"><div className="ac-sumk">Total collected</div><div className="ac-sumv">{money(total)}</div><div className="ac-sumc">{rows.length} {rows.length === 1 ? "payment" : "payments"}</div></div>
        </div>

        <div className="col-secttl">From this month&apos;s visits <span>{money(thisMonth)}</span></div>
        {table(thisRows)}

        <div className="col-secttl" style={{ marginTop: 18 }}>From earlier months&apos; visits <span>{money(prior)}</span></div>
        {table(priorRows)}

        <div className="ac-total" style={{ marginTop: 16 }}><span>Total insurance collected in {monthLabel}</span><span>{money(total)}</span></div>

        <footer className="ac-foot">{practiceName} &middot; {clinicianName} &middot; insurance collected in {monthLabel}, as of {asOf}</footer>
      </div>
    </div>
  );
}
