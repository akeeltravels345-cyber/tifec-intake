"use client";

import { useEffect, useState } from "react";

interface DupRecord {
  id: string; first: string; last: string;
  dob?: string; email?: string; guardianEmail?: string; phone?: string; memberId?: string;
  insurerId: string | null; insurerName: string; createdAt: string;
  clinicianIds: string[]; clinicianNames: string[];
  sessionCount: number; docCount: number; noteCount: number; isSample: boolean;
}
interface Group { key: string; suggestedSurvivorId: string; confidence: "likely" | "possible"; reason: string; records: DupRecord[] }

const fmtDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); };

export default function DuplicatesClient() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState("");
  const [keep, setKeep] = useState<Map<string, string>>(new Map());       // group key -> survivor id
  const [confirming, setConfirming] = useState<string>("");               // group key awaiting confirm
  const [busy, setBusy] = useState<string>("");                           // group key merging
  const [done, setDone] = useState<Map<string, string>>(new Map());       // group key -> result message

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/billing/clients/duplicates", { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not load duplicates."); return; }
      setGroups(data.groups as Group[]);
      setKeep(new Map((data.groups as Group[]).map((g) => [g.key, g.suggestedSurvivorId])));
    } catch { setError("Could not reach the server."); }
  }
  useEffect(() => { load(); }, []);

  async function merge(g: Group) {
    const survivorId = keep.get(g.key) || g.suggestedSurvivorId;
    const duplicateIds = g.records.map((r) => r.id).filter((id) => id !== survivorId);
    if (!duplicateIds.length) return;
    setBusy(g.key); setError("");
    try {
      const res = await fetch("/api/billing/clients/duplicates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivorId, duplicateIds }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Merge failed."); setBusy(""); setConfirming(""); return; }
      const survivor = g.records.find((r) => r.id === survivorId);
      setDone((m) => new Map(m).set(g.key, `Merged ${data.merged} record${data.merged === 1 ? "" : "s"} into ${survivor ? `${survivor.first} ${survivor.last}` : "the kept record"} — moved ${data.movedSessions} session${data.movedSessions === 1 ? "" : "s"}, ${data.movedDocs} document${data.movedDocs === 1 ? "" : "s"}, ${data.movedAppts} appointment${data.movedAppts === 1 ? "" : "s"}.`));
      setGroups((gs) => (gs ? gs.filter((x) => x.key !== g.key) : gs));
    } catch { setError("Could not reach the server."); }
    finally { setBusy(""); setConfirming(""); }
  }

  const doneList = [...done.entries()];

  return (
    <div className="dup-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {doneList.length > 0 && (
        <div className="dup-done">
          {doneList.map(([k, msg]) => <div key={k} className="dup-done-row">✓ {msg}</div>)}
        </div>
      )}

      {error && <div className="dup-err">{error}</div>}

      {groups === null && !error && <div className="dup-muted">Scanning for duplicates…</div>}

      {groups !== null && groups.length === 0 && (
        <div className="dup-empty">
          <div className="dup-empty-tick">✓</div>
          No duplicate clients found. New ones are now prevented automatically.
        </div>
      )}

      {groups?.map((g) => {
        const survivorId = keep.get(g.key) || g.suggestedSurvivorId;
        const name = `${g.records[0]?.first ?? ""} ${g.records[0]?.last ?? ""}`.trim();
        return (
          <div key={g.key} className="dup-group">
            <div className="dup-group-head">
              <div className="dup-group-name">
                {name}
                <span className={`dup-conf ${g.confidence}`}>{g.confidence === "likely" ? "Likely" : "Possible"}</span>
              </div>
              <div className="dup-group-tag">{g.records.length} records · {g.reason}</div>
            </div>

            <div className="dup-cards">
              {g.records.map((r) => {
                const isKeep = r.id === survivorId;
                return (
                  <label key={r.id} className={`dup-card${isKeep ? " keep" : ""}`}>
                    <div className="dup-card-top">
                      <input type="radio" name={`keep-${g.key}`} checked={isKeep}
                        onChange={() => setKeep((m) => new Map(m).set(g.key, r.id))} />
                      <span className="dup-card-role">{isKeep ? "Keep this one" : "Merge in"}</span>
                      {r.isSample && <span className="dup-sample">sample</span>}
                    </div>
                    <div className="dup-card-name">{`${r.first} ${r.last}`.trim()}</div>
                    <dl className="dup-facts">
                      <div><dt>DOB</dt><dd>{r.dob || "—"}</dd></div>
                      <div><dt>Email</dt><dd>{r.email || "—"}</dd></div>
                      {r.guardianEmail && <div><dt>Guardian</dt><dd>{r.guardianEmail}</dd></div>}
                      <div><dt>Phone</dt><dd>{r.phone || "—"}</dd></div>
                      <div><dt>Member ID</dt><dd>{r.memberId || "—"}</dd></div>
                      <div><dt>Insurer</dt><dd>{r.insurerName || "Self-pay"}</dd></div>
                      <div><dt>Clinicians</dt><dd>{r.clinicianNames.join(", ") || "—"}</dd></div>
                      <div><dt>Data</dt><dd>{r.sessionCount} sessions · {r.docCount} docs · {r.noteCount} notes</dd></div>
                      <div><dt>Added</dt><dd>{fmtDate(r.createdAt)}</dd></div>
                    </dl>
                  </label>
                );
              })}
            </div>

            <div className="dup-actions">
              {confirming === g.key ? (
                <>
                  <span className="dup-confirm-q">Merge the other {g.records.length - 1} into the kept record? This can&apos;t be undone.</span>
                  <button className="dup-btn danger" disabled={busy === g.key} onClick={() => merge(g)}>{busy === g.key ? "Merging…" : "Yes, merge"}</button>
                  <button className="dup-btn ghost" disabled={busy === g.key} onClick={() => setConfirming("")}>Cancel</button>
                </>
              ) : (
                <button className="dup-btn" onClick={() => setConfirming(g.key)}>Merge {g.records.length} records →</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Uses the app's theme variables (--card, --ink, --muted, --edge, --indigo,
// --pos/--amber/--neg), so it reads correctly in both light and dark mode.
const CSS = `
.dup-wrap{max-width:900px;margin:0 auto;padding:4px 0 40px;}
.dup-muted{color:var(--muted);padding:18px 2px;}
.dup-err{background:var(--neg-bg);border:1px solid var(--neg);color:var(--neg);border-radius:10px;padding:10px 14px;margin:10px 0;font-size:14px;}
.dup-done{margin:4px 0 14px;}
.dup-done-row{background:var(--pos-bg);border:1px solid var(--pos);color:var(--pos);border-radius:10px;padding:9px 14px;margin-bottom:6px;font-size:13.5px;}
.dup-empty{text-align:center;color:var(--muted);padding:48px 16px;font-size:15px;}
.dup-empty-tick{font-size:30px;color:var(--pos);margin-bottom:8px;}
.dup-group{border:1px solid var(--edge);border-radius:16px;padding:16px 16px 14px;margin:14px 0;background:var(--card);}
.dup-group-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
.dup-group-name{font-size:17px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.dup-conf{font-size:11px;font-weight:700;letter-spacing:.02em;border-radius:999px;padding:2px 9px;text-transform:uppercase;}
.dup-conf.likely{background:var(--pos-bg);color:var(--pos);}
.dup-conf.possible{background:var(--amber-bg);color:var(--amber-ink);}
.dup-group-tag{font-size:12px;color:var(--muted);}
.dup-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;}
.dup-card{display:block;border:1px solid var(--edge);border-radius:12px;padding:11px 12px;cursor:pointer;background:var(--panel);transition:border-color .12s,box-shadow .12s;}
.dup-card:hover{border-color:var(--muted);}
.dup-card.keep{border-color:var(--indigo);box-shadow:0 0 0 2px var(--indigo);}
.dup-card-top{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.dup-card-role{font-size:12.5px;font-weight:700;color:var(--muted);}
.dup-card.keep .dup-card-role{color:var(--indigo);}
.dup-card-name{font-size:14px;font-weight:700;color:var(--ink);margin:0 0 8px;overflow-wrap:anywhere;}
.dup-sample{margin-left:auto;font-size:10.5px;background:var(--amber-bg);color:var(--amber-ink);border-radius:6px;padding:1px 6px;}
.dup-facts{margin:0;display:grid;gap:3px;}
.dup-facts>div{display:grid;grid-template-columns:82px 1fr;gap:8px;font-size:12.5px;}
.dup-facts dt{color:var(--muted);margin:0;}
.dup-facts dd{margin:0;color:var(--ink);overflow-wrap:anywhere;}
.dup-actions{display:flex;align-items:center;gap:10px;margin-top:13px;flex-wrap:wrap;}
.dup-confirm-q{font-size:13px;color:var(--ink);}
.dup-btn{border:0;border-radius:9px;padding:9px 15px;font-size:13.5px;font-weight:600;cursor:pointer;background:var(--indigo);color:#fff;}
.dup-btn:hover{filter:brightness(1.08);}
.dup-btn.danger{background:var(--neg);}
.dup-btn.ghost{background:transparent;color:var(--muted);border:1px solid var(--edge);}
.dup-btn:disabled{opacity:.6;cursor:default;}
`;
