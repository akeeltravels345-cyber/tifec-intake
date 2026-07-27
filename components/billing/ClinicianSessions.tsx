"use client";

import Link from "next/link";

export interface SessionRow {
  id: string;
  date: string;
  clientId: string | null;
  client: string;
  codes: string;
  fee: number;
  copay: number;
  insurance: number;
  status: "self" | "paid" | "pend";
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<SessionRow["status"], string> = { self: "Self-pay", paid: "Billed", pend: "Outstanding" };
const pill = (s: SessionRow["status"]) => <span className={`cd-pill ${s}`}>{STATUS[s]}</span>;

/** The month's sessions. Clicking a client opens their full record — their whole
 *  history plus their details and CMS-1500. The link uses the client's opaque id,
 *  never their name, so no PHI ends up in the URL. */
export default function ClinicianSessions({ month }: { month: SessionRow[] }) {
  return (
    <div className="cd-tblwrap">
      <table className="cd-tbl">
        <thead>
          <tr>
            <th>Date</th><th>Client</th><th>Code</th>
            <th className="num">Fee</th><th className="num">Co-pay</th><th className="num">Insurance</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {month.map((s) => (
            <tr key={s.id}>
              <td>{s.date}</td>
              <td className="nm">
                {s.clientId
                  ? <Link href={`/billing/clients/${s.clientId}`} className="bq-clientlink">{s.client}</Link>
                  : s.client}
              </td>
              <td>{s.codes || "—"}</td>
              <td className="num">{money(s.fee)}</td>
              <td className="num">{money(s.copay)}</td>
              <td className="num">{money(s.insurance)}</td>
              <td>{pill(s.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
