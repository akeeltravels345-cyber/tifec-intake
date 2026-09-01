"use client";

import { useState } from "react";
import Icd10Picker from "./Icd10Picker";
import type { DiagnosisLogEntry } from "@/lib/clients";

const stamp = (iso: string) => {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Cayman", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }
  catch { return iso; }
};

/** The client's standing ICD-10 diagnoses, editable by anyone who can see the
 *  record. Every add/remove is saved to the audit log. */
export default function Icd10Section({ clientId, initial, initialLog }: { clientId: string; initial: string[]; initialLog: DiagnosisLogEntry[] }) {
  const [codes, setCodes] = useState<string[]>(initial);
  const [log, setLog] = useState<DiagnosisLogEntry[]>(initialLog);
  const [showLog, setShowLog] = useState(false);
  const [err, setErr] = useState("");

  async function save(next: string[]) {
    const prev = codes;
    setCodes(next); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/diagnosis`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes: next }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not save."); setCodes(prev); return; }
      setCodes(data.diagnosis); setLog(data.diagnosisLog);
    } catch { setErr("Could not reach the server."); setCodes(prev); }
  }

  return (
    <div>
      <Icd10Picker value={codes} onChange={save} />
      {err && <p className="icd-err">{err}</p>}
      {log.length > 0 && (
        <div className="icd-log">
          <button type="button" className="icd-logtoggle" onClick={() => setShowLog((s) => !s)}>
            <span className={`icd-logchev ${showLog ? "up" : ""}`} aria-hidden="true">▸</span>
            Change history <span className="icd-logcount">{log.length}</span>
          </button>
          {showLog && (
            <ul className="icd-loglist">
              {[...log].reverse().map((e, i) => (
                <li key={i}>
                  <span className={`icd-logact ${e.action}`}>{e.action === "add" ? "＋ Added" : "－ Removed"}</span>
                  <span className="icd-logcode">{e.code}</span>
                  <span className="icd-logby">by {e.byName}</span>
                  <span className="icd-logat">{stamp(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
