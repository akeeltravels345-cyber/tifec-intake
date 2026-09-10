"use client";

import { useState } from "react";

const money = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Preview { to: string; hasEmail: boolean; subject: string; message: string; invoiceNo: string; amountDue: number; replyTo?: string; replyToName?: string; }

/** "Email to client" for the invoice page: opens a preview of exactly what the
 *  client will receive (recipient, subject, editable message, attached PDF),
 *  then sends it through the app's mail system on confirm. */
export default function InvoiceEmail({
  clientId, query, clientName, clientEmail, invoiceNo, amountDue,
}: {
  clientId: string; query: string; clientName: string;
  clientEmail: string; invoiceNo: string; amountDue: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [sentTo, setSentTo] = useState("");

  const base = `/api/billing/clients/${clientId}/invoice/email${query ? `?${query}` : ""}`;

  async function openPanel() {
    setOpen(true); setErr(""); setSentTo(""); setPreview(null); setLoading(true);
    try {
      const res = await fetch(base, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not prepare the email."); return; }
      setPreview(data); setMessage(data.message || ""); setSubject(data.subject || "");
    } catch { setErr("Could not reach the server."); }
    finally { setLoading(false); }
  }

  async function send() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, subject }),
      });
      const data = await res.json();
      if (!res.ok || !data.sent) { setErr(data.error || "Could not send the email."); return; }
      setSentTo(data.to || preview?.to || clientEmail);
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  }

  function close() { setOpen(false); }

  return (
    <>
      <button type="button" className="bl-cta inv-noprint" onClick={openPanel}>Email to client</button>

      {open && (
        <div className="iem-back inv-noprint" role="dialog" aria-modal="true" aria-label="Email invoice to client" onClick={close}>
          <div className="iem-card" onClick={(e) => e.stopPropagation()}>
            <div className="iem-head">
              <h3>Email invoice to client</h3>
              <button type="button" className="iem-x" onClick={close} aria-label="Close">×</button>
            </div>

            {loading ? (
              <p className="iem-note">Preparing the email…</p>
            ) : sentTo ? (
              <div className="iem-sent">
                <div className="iem-tick">✓</div>
                <p><strong>Sent.</strong> Invoice {invoiceNo} is on its way to {sentTo}.</p>
                <button type="button" className="bl-cta" onClick={close}>Done</button>
              </div>
            ) : preview && !preview.hasEmail ? (
              <div className="iem-body">
                <p className="iem-warn">This client has no email address on file, so there is nowhere to send the invoice. Add one on their client record first, then come back here.</p>
                <div className="iem-actions"><button type="button" className="iem-cancel" onClick={close}>Close</button></div>
              </div>
            ) : preview ? (
              <div className="iem-body">
                <div className="iem-field"><span className="iem-lab">To</span><span className="iem-val">{clientName} &lt;{preview.to}&gt;</span></div>
                <label className="iem-field iem-fieldedit"><span className="iem-lab">Subject</span><input className="iem-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={preview.subject} /></label>
                <div className="iem-field"><span className="iem-lab">Attached</span><span className="iem-val">Invoice-{invoiceNo}.pdf &middot; {money(amountDue)} due</span></div>
                {preview.replyTo && <div className="iem-field"><span className="iem-lab">Replies to</span><span className="iem-val">{preview.replyToName ? `${preview.replyToName} · ` : ""}{preview.replyTo}</span></div>}

                <label className="iem-msglab">Message <span>(you can edit this)</span></label>
                <textarea className="iem-msg" rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />

                {err && <p className="iem-err">{err}</p>}

                <div className="iem-actions">
                  <button type="button" className="iem-cancel" onClick={close} disabled={busy}>Cancel</button>
                  <button type="button" className="bl-cta" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send to client"}</button>
                </div>
              </div>
            ) : (
              <div className="iem-body">
                <p className="iem-err">{err || "Could not prepare the email."}</p>
                <div className="iem-actions"><button type="button" className="iem-cancel" onClick={close}>Close</button></div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
