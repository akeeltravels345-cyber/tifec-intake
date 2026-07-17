"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Ext { id: string; name: string; billerPct: number; active: boolean; }
interface Row extends Ext { collected: number; cut: number; claims: number; }

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/billing/external", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
}

export default function OutsideClient({ rows: rowsIn, monthLabel }: { rows: Row[]; monthLabel: string }) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [rows, setRows] = useState<Row[]>(rowsIn);
  const [name, setName] = useState("");
  const [pct, setPct] = useState("10");
  const [busy, setBusy] = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); router.refresh(); };
  const fail = (e: unknown) => { setToast(e instanceof Error ? e.message : "Error"); setTimeout(() => setToast(""), 2400); };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await post({ name: name.trim(), billerPct: Number(pct) || 0, active: true });
      setName(""); setPct("10");
      flash("Clinician added");
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  const save = async (r: Row) => { try { await post({ id: r.id, name: r.name, billerPct: r.billerPct, active: r.active }); flash("Saved"); } catch (e) { fail(e); } };
  const remove = async (r: Row) => {
    if (r.claims > 0) { setToast("This clinician has claims this month, so they can't be removed."); setTimeout(() => setToast(""), 2600); return; }
    try { await post({ action: "delete", id: r.id }); setRows(rows.filter((x) => x.id !== r.id)); flash("Removed"); } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="su-sec">
        <div className="su-sechead">
          <h3 className="su-sech">Add an outside clinician</h3>
          <span className="su-hint">Someone you bill for privately. They get no login, and their money stays out of TIFEC&apos;s books.</span>
        </div>
        <div className="su-card">
          <form onSubmit={add} style={{ display: "flex", gap: 10, padding: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "2 1 240px" }}>
              <label className="ls-q" htmlFor="ext-name">Clinician name</label>
              <input id="ext-name" className="su-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Bodden" />
            </div>
            <div style={{ flex: "0 1 130px" }}>
              <label className="ls-q" htmlFor="ext-pct">Your rate %</label>
              <input id="ext-pct" className="su-in" type="number" step="0.5" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
            </div>
            <button className="bl-cta" type="submit" disabled={busy || !name.trim()}>{busy ? "Adding..." : "Add clinician"}</button>
          </form>
        </div>
      </div>

      <div className="su-sec">
        <div className="su-sechead">
          <h3 className="su-sech">Your outside clinicians</h3>
          <span className="su-hint">{monthLabel} earnings. Change a rate and it applies to what you collect from here on.</span>
        </div>
        <div className="su-card">
          {rows.length === 0 ? (
            <p className="su-hint" style={{ padding: 20, margin: 0 }}>None yet. Add the first one above, then log their claims below.</p>
          ) : (
            <div className="su-tblwrap">
              {/* min-width keeps the rate and name legible on a narrow screen:
                  the wrapper scrolls rather than squeezing the inputs. */}
              <table className="su-tbl" style={{ minWidth: 660 }}>
                <thead>
                  <tr>
                    <th>Clinician</th>
                    <th className="num">Your rate</th>
                    <th className="num">Collected · {monthLabel}</th>
                    <th className="num">You earned</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nm">
                        <input className="su-in" value={r.name} onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, name: e.target.value } : x))} />
                      </td>
                      <td className="num">
                        <input className="su-in short" type="number" step="0.5" min="0" max="100" value={r.billerPct}
                          onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, billerPct: Number(e.target.value) } : x))} />
                      </td>
                      <td className="num">{money(r.collected)}<br /><span className="su-hint">{r.claims} claim{r.claims === 1 ? "" : "s"}</span></td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(r.cut)}</td>
                      <td>
                        <div className="su-actions">
                          <button className="bl-cta" type="button" onClick={() => save(r)}>Save</button>
                          <button className="su-del" type="button" onClick={() => remove(r)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="su-toast">{toast}</div>}
    </>
  );
}
