"use client";

import { useState } from "react";

const money = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Payer { id: string; name: string; email: string }
interface Preview {
  ready: boolean;
  reason?: string;
  payers: Payer[];
  payer?: { id: string; name: string; email: string };
  hasEmail?: boolean;
  patientName?: string;
  lineCount?: number;
  formCount?: number;
  total?: number;
  subject?: string;
  message?: string;
  replyTo?: string;
  replyToName?: string;
}

/** "Send claim to insurer" for the CMS-1500 page: previews exactly what the payer
 *  will receive (recipient, subject, editable cover note, attached CMS-1500 PDF),
 *  then on confirm emails it, stores the PDF in the client's documents, and marks
 *  the claimed sessions submitted — the claims analogue of "Email to client". */
export default function ClaimEmail({ clientId, clientName, sessions }: { clientId: string; clientName: string; sessions?: string }) {
  // Build the API query: the chosen payer, plus an optional session scope (from the
  // batch page, where the biller picked specific visits).
  const qstr = (pid?: string) => {
    const p = new URLSearchParams();
    if (pid) p.set("payer", pid);
    if (sessions) p.set("sessions", sessions);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [payerId, setPayerId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [done, setDone] = useState<{ to: string; billedCount: number } | null>(null);

  async function fetchPreview(pid?: string) {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/claim/email${qstr(pid)}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not prepare the claim."); setPreview(null); return; }
      setPreview(data);
      if (data.ready) { setMessage(data.message || ""); setSubject(data.subject || ""); setPayerId(data.payer?.id || ""); }
    } catch { setErr("Could not reach the server."); }
    finally { setLoading(false); }
  }

  function openPanel() { setOpen(true); setErr(""); setDone(null); setPreview(null); setPayerId(""); fetchPreview(); }
  function pickPayer(pid: string) { setPayerId(pid); fetchPreview(pid); }

  async function send() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/billing/clients/${clientId}/claim/email${qstr(payerId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, subject }),
      });
      const data = await res.json();
      if (!res.ok || !data.sent) { setErr(data.error || "Could not send the claim."); return; }
      setDone({ to: data.to || preview?.payer?.email || "", billedCount: data.billedCount ?? 0 });
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  }

  function close() { setOpen(false); }

  return (
    <>
      <button type="button" className="bl-cta hcfa-noprint" onClick={openPanel}>Send claim to insurer</button>

      {open && (
        <div className="iem-back hcfa-noprint" role="dialog" aria-modal="true" aria-label="Send claim to insurer" onClick={close}>
          <div className="iem-card" onClick={(e) => e.stopPropagation()}>
            <div className="iem-head">
              <h3>Send claim to insurer</h3>
              <button type="button" className="iem-x" onClick={close} aria-label="Close">×</button>
            </div>

            {loading ? (
              <p className="iem-note">Preparing the claim…</p>
            ) : done ? (
              <div className="iem-sent">
                <div className="iem-tick">✓</div>
                <p><strong>Claim sent</strong> to {done.to}. A copy is saved in {clientName}&apos;s documents{done.billedCount > 0 ? `, and ${done.billedCount} session${done.billedCount === 1 ? "" : "s"} marked submitted` : ""}.</p>
                <button type="button" className="bl-cta" onClick={close}>Done</button>
              </div>
            ) : preview && !preview.ready ? (
              <div className="iem-body">
                {preview.payers.length > 1 ? (
                  <>
                    <p className="iem-note">{preview.reason || "Choose which payer to send this claim to."}</p>
                    <div className="iem-payers">
                      {preview.payers.map((p) => (
                        <button key={p.id} type="button" className="iem-payer" onClick={() => pickPayer(p.id)}>
                          <span className="iem-payer-nm">{p.name}</span>
                          <span className="iem-payer-em">{p.email || "no claims email set"}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="iem-warn">{preview.reason || "This client has no CMS-1500 sessions to claim."}</p>
                )}
                <div className="iem-actions"><button type="button" className="iem-cancel" onClick={close}>Close</button></div>
              </div>
            ) : preview && preview.ready && !preview.hasEmail ? (
              <div className="iem-body">
                <p className="iem-warn"><strong>{preview.payer?.name}</strong> has no claims email set, so there&apos;s nowhere to send this claim. Add one in <b>Setup → Insurers</b>, then come back here.</p>
                <div className="iem-actions"><button type="button" className="iem-cancel" onClick={close}>Close</button></div>
              </div>
            ) : preview && preview.ready ? (
              <div className="iem-body">
                <div className="iem-field"><span className="iem-lab">To</span><span className="iem-val">{preview.payer?.name} &lt;{preview.payer?.email}&gt;</span></div>
                {preview.payers.length > 1 && (
                  <label className="iem-field iem-fieldedit"><span className="iem-lab">Payer</span>
                    <select className="iem-subject" value={payerId} onChange={(e) => pickPayer(e.target.value)}>
                      {preview.payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="iem-field iem-fieldedit"><span className="iem-lab">Subject</span><input className="iem-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={preview.subject} /></label>
                <div className="iem-field"><span className="iem-lab">Attached</span><span className="iem-val">CMS-1500 &middot; {preview.lineCount} line{preview.lineCount === 1 ? "" : "s"}{(preview.formCount ?? 1) > 1 ? ` · ${preview.formCount} pages` : ""} &middot; {money(preview.total ?? 0)}</span></div>
                {preview.replyTo && <div className="iem-field"><span className="iem-lab">Replies to</span><span className="iem-val">{preview.replyToName ? `${preview.replyToName} · ` : ""}{preview.replyTo}</span></div>}

                <label className="iem-msglab">Cover note <span>(you can edit this)</span></label>
                <textarea className="iem-msg" rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />

                <p className="iem-fineprint">Sending will email the claim, save a copy to {clientName}&apos;s documents, and mark the claimed sessions submitted (billed today).</p>
                {err && <p className="iem-err">{err}</p>}

                <div className="iem-actions">
                  <button type="button" className="iem-cancel" onClick={close} disabled={busy}>Cancel</button>
                  <button type="button" className="bl-cta" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send claim"}</button>
                </div>
              </div>
            ) : (
              <div className="iem-body">
                <p className="iem-err">{err || "Could not prepare the claim."}</p>
                <div className="iem-actions"><button type="button" className="iem-cancel" onClick={close}>Close</button></div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
