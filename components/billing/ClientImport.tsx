"use client";

import { useState } from "react";

interface Clin { id: string; name: string }
interface Row { first: string; last: string; insurerName: string | null; insurerId: string | null; insurerMatched: boolean }
interface Preview { providerName: string | null; forClinician: string; clients: Row[] }

export default function ClientImport({ clinicians }: { clinicians: Clin[] }) {
  const [clinicianId, setClinicianId] = useState(clinicians[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ added: number; duplicates: number; forClinician: string } | null>(null);

  const reset = () => { setPreview(null); setDone(null); setError(""); };

  async function send(commit: boolean) {
    if (!file || !clinicianId) { setError("Pick a clinician and attach the PDF."); return; }
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("clinicianId", clinicianId);
      if (commit) fd.set("commit", "1");
      const res = await fetch("/api/billing/import-clients", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Import failed");
      if (commit) { setDone({ added: j.added, duplicates: j.duplicates, forClinician: j.forClinician }); setPreview(null); setFile(null); }
      else setPreview(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }

  const providerNote = preview?.providerName
    ? `The report is for ${preview.providerName}. `
    : "";

  return (
    <div className="su-sec">
      <div className="su-sechead">
        <h2 className="su-sech">Import a client roster (PDF)</h2>
        <span className="su-hint">Upload a clinician&apos;s payment/AR report. The clients on it are added to that clinician&apos;s list so they can be picked when logging. Anyone already on the list is skipped.</span>
      </div>

      <div className="su-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 220px" }}>
            <label className="ls-q" htmlFor="ci-clin">Whose clients are these?</label>
            <select id="ci-clin" className="su-sel" value={clinicianId} onChange={(e) => { setClinicianId(e.target.value); reset(); }}>
              {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 240px" }}>
            <label className="ls-q" htmlFor="ci-file">The report (PDF)</label>
            <input id="ci-file" type="file" accept="application/pdf,.pdf" style={{ fontSize: 13 }}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
          </div>
          <button className="bl-cta" type="button" disabled={busy || !file} onClick={() => send(false)}>
            {busy && !preview ? "Reading…" : "Check the file"}
          </button>
        </div>
        {error && <p className="tm-err" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      {done && (
        <div className="su-card" style={{ padding: 16, marginTop: 14 }}>
          <b>Added {done.added} client{done.added === 1 ? "" : "s"} to {done.forClinician}.</b>
          {done.duplicates > 0 && <> {done.duplicates} were already on the list and were skipped.</>}
          {" "}They can now be picked when logging a session.
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 14 }}>
          <div className="su-sechead" style={{ marginTop: 4 }}>
            <h3 className="su-sech" style={{ fontSize: 17 }}>Check it before it lands</h3>
            <span className="su-hint">{providerNote}{preview.clients.length} client{preview.clients.length === 1 ? "" : "s"} found · they&apos;ll be added to <b>{preview.forClinician}</b></span>
          </div>
          <div className="su-card">
            <div className="su-tblwrap">
              <table className="su-tbl" style={{ minWidth: 460 }}>
                <thead><tr><th>Client</th><th>Usual insurer</th></tr></thead>
                <tbody>
                  {preview.clients.map((c, i) => (
                    <tr key={i}>
                      <td className="nm">{c.first} {c.last}</td>
                      <td>
                        {!c.insurerName ? <span className="su-hint">Self-pay</span>
                          : c.insurerMatched ? c.insurerName
                          : <span style={{ color: "var(--neg)" }}>{c.insurerName} — not a known insurer</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="bl-cta" type="button" disabled={busy} onClick={() => send(true)}>
              {busy ? "Adding…" : `Add ${preview.clients.length} client${preview.clients.length === 1 ? "" : "s"} to ${preview.forClinician}`}
            </button>
            <button className="su-del" type="button" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
