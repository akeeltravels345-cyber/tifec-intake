"use client";

import { Fragment, useState } from "react";

export interface SessionRow {
  id: string;
  date: string;
  client: string;
  codes: string;
  fee: number;
  copay: number;
  insurance: number;
  status: "self" | "paid" | "pend";
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const STATUS: Record<SessionRow["status"], string> = { self: "Self-pay", paid: "Billed", pend: "Outstanding" };
const key = (name: string) => name.trim().toLowerCase();

const pill = (s: SessionRow["status"]) => <span className={`cd-pill ${s}`}>{STATUS[s]}</span>;

/** The month's sessions, where clicking a client opens their whole history with
 *  you. Kept in-page rather than a linked route: a client's name is PHI, and a
 *  URL would put it in browser history, logs and referrer headers. */
export default function ClinicianSessions({ month, history, monthLabel }: {
  month: SessionRow[];
  history: SessionRow[];
  monthLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const historyFor = (client: string) =>
    history.filter((h) => key(h.client) === key(client)).sort((a, b) => b.date.localeCompare(a.date));

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
          {month.map((s) => {
            const k = key(s.client);
            const isOpen = open === k;
            const all = isOpen ? historyFor(s.client) : [];
            const seen = all.length;
            const billedTotal = all.reduce((t, x) => t + x.fee, 0);
            const owed = all.filter((x) => x.status === "pend").reduce((t, x) => t + x.insurance, 0);

            return (
              <Fragment key={s.id}>
                <tr className={isOpen ? "cd-row-open" : undefined}>
                  <td>{s.date}</td>
                  <td className="nm">
                    <button
                      type="button"
                      className={`cd-clientbtn ${isOpen ? "on" : ""}`}
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : k)}
                    >
                      <span className="chev" aria-hidden="true">›</span>{s.client}
                    </button>
                  </td>
                  <td>{s.codes || "—"}</td>
                  <td className="num">{money(s.fee)}</td>
                  <td className="num">{money(s.copay)}</td>
                  <td className="num">{money(s.insurance)}</td>
                  <td>{pill(s.status)}</td>
                </tr>

                {isOpen && (
                  <tr className="cd-detailrow">
                    <td colSpan={7}>
                      <div className="cd-detail">
                        <div className="cd-detailhead">
                          <span className="cd-lab">Every appointment with {s.client}</span>
                          <span className="cd-hint">
                            {seen} appointment{seen === 1 ? "" : "s"} · {money0(billedTotal)} of work
                            {owed > 0 && <> · {money0(owed)} still with insurers</>}
                          </span>
                        </div>
                        <table className="cd-tbl cd-subtbl">
                          <tbody>
                            {all.map((h) => (
                              <tr key={h.id}>
                                <td>{h.date}</td>
                                <td>{h.codes || "—"}</td>
                                <td className="num">{money(h.fee)}</td>
                                <td className="num">{money(h.copay)}</td>
                                <td className="num">{money(h.insurance)}</td>
                                <td>{pill(h.status)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {seen > month.filter((m) => key(m.client) === k).length && (
                          <p className="cd-hint" style={{ margin: "10px 2px 0" }}>
                            Includes appointments from before {monthLabel}.
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
