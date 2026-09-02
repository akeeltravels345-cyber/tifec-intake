"use client";

import { useState } from "react";

interface Result {
  apply: boolean;
  totals: { clients: number; alreadyHasEmail: number; matched: number; ambiguous: number; noMatch: number; updated: number };
  proposed: { name: string; email: string }[];
  ambiguous: { name: string; emails: string[] }[];
}

// Admin tool: pull client contact emails from the intake system into the billing
// client records. Always previews first (writes nothing); a second click applies.
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
      <h2 className="iie-h">Import client emails from intake</h2>
      <p className="iie-sub">
        Matches each billing client to their intake form (by name, and date of birth when both have one) and fills in
        the email. It only fills clients that have <b>no email yet</b> — it never overwrites — and skips anyone whose
        intake shows more than one email, so you can check those by hand.
      </p>

      <div className="iie-acts">
        <button className="iie-btn" disabled={busy} onClick={() => { setApplied(false); run(false); }}>
          {busy && !applied ? "Checking…" : "Preview matches"}
        </button>
        {res && !applied && t && t.matched > 0 && (
          <button className="iie-btn apply" disabled={busy} onClick={() => run(true)}>
            {busy ? "Importing…" : `Import ${t.matched} email${t.matched === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {err && <p className="iie-err">{err}</p>}

      {res && t && (
        <div className="iie-out">
          <div className="iie-stats">
            <span><b>{t.clients}</b> clients</span>
            <span><b>{applied ? t.updated : t.matched}</b> {applied ? "updated" : "to import"}</span>
            <span><b>{t.alreadyHasEmail}</b> already had one</span>
            <span><b>{t.ambiguous}</b> need a look</span>
            <span><b>{t.noMatch}</b> no intake match</span>
          </div>

          {applied ? (
            <p className="iie-done">✓ Imported {t.updated} email{t.updated === 1 ? "" : "s"} into the client records.</p>
          ) : t.matched > 0 ? (
            <>
              <p className="iie-note">These will be imported when you click Import:</p>
              <ul className="iie-list">
                {res.proposed.map((p, i) => (
                  <li key={i}><span className="nm">{p.name}</span><span className="em">{p.email}</span></li>
                ))}
              </ul>
            </>
          ) : (
            <p className="iie-note">No new emails to import — every match already has one, or there was no clean intake match.</p>
          )}

          {res.ambiguous.length > 0 && (
            <>
              <p className="iie-note warn">Skipped — more than one email on file, please set these by hand:</p>
              <ul className="iie-list">
                {res.ambiguous.map((a, i) => (
                  <li key={i}><span className="nm">{a.name}</span><span className="em">{a.emails.join(" · ")}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
