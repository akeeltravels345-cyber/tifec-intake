"use client";

import { useState } from "react";

interface Result {
  apply: boolean;
  totals: { clients: number; matched: number; ambiguous: number; skipped: number; updated: number };
  proposed: { name: string; fields: string[] }[];
  ambiguous: { name: string; note: string }[];
}

// Admin tool: pull client contact details (email, date of birth, sex, phone,
// address) from the intake system into the billing client records. Always
// previews first (writes nothing); a second click applies.
export default function ImportIntakeEmails() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [applied, setApplied] = useState(false);
  const [err, setErr] = useState("");

  async function run(apply: boolean) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/billing/import-emails", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apply ? { apply: true } : {}),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error || "Something went wrong."); return; }
      setRes(data);
      if (apply) setApplied(true);
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  }

  const t = res?.totals;

  return (
    <div className="iie">
      <h2 className="iie-h">Import client details from intake</h2>
      <p className="iie-sub">
        Matches each billing client to their intake form (by name, and date of birth when both have one) and fills in
        contact details: <b>email, date of birth, sex, phone and address</b>. It only fills fields that are <b>empty</b> on
        the billing record, so it never overwrites what you already have, and it skips any field whose intake shows
        conflicting values so you can check those by hand.
      </p>

      <div className="iie-acts">
        <button className="iie-btn" disabled={busy} onClick={() => { setApplied(false); run(false); }}>
          {busy && !applied ? "Checking…" : "Preview matches"}
        </button>
        {res && !applied && t && t.matched > 0 && (
          <button className="iie-btn apply" disabled={busy} onClick={() => run(true)}>
            {busy ? "Importing…" : `Import details for ${t.matched} client${t.matched === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {err && <p className="iie-err">{err}</p>}

      {res && t && (
        <div className="iie-out">
          <div className="iie-stats">
            <span><b>{t.clients}</b> clients</span>
            <span><b>{applied ? t.updated : t.matched}</b> {applied ? "updated" : "to fill"}</span>
            <span><b>{t.ambiguous}</b> need a look</span>
            <span><b>{t.skipped}</b> nothing to fill</span>
          </div>

          {applied ? (
            <p className="iie-done">✓ Imported details into {t.updated} client record{t.updated === 1 ? "" : "s"}.</p>
          ) : t.matched > 0 ? (
            <>
              <p className="iie-note">These fields will be filled when you click Import:</p>
              <ul className="iie-list">
                {res.proposed.map((p, i) => (
                  <li key={i}><span className="nm">{p.name}</span><span className="em">{p.fields.join(" · ")}</span></li>
                ))}
              </ul>
            </>
          ) : (
            <p className="iie-note">Nothing to fill. Every match already has these details, or there was no clean intake match.</p>
          )}

          {res.ambiguous.length > 0 && (
            <>
              <p className="iie-note warn">Skipped, conflicting values on intake, please set these by hand:</p>
              <ul className="iie-list">
                {res.ambiguous.map((a, i) => (
                  <li key={i}><span className="nm">{a.name}</span><span className="em">{a.note}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
