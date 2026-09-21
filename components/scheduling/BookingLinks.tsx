"use client";

import { useState } from "react";
import QRCode from "qrcode";
import Foldable from "@/components/billing/Foldable";

export default function BookingLinks({ clinicianId, clinicianName, types }: {
  clinicianId: string; clinicianName: string; types: { id: string; name: string }[];
}) {
  const [copied, setCopied] = useState("");
  const [qr, setQr] = useState<{ label: string; url: string; img: string } | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const personal = `${origin}/book?clinician=${clinicianId}`;
  const firstName = (clinicianName || "").replace(/^(Dr|Mrs|Mr|Ms|Miss)\.?\s+/i, "").split(/\s+/)[0] || "you";

  const copy = (text: string, key: string) => { try { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* ignore */ } };
  const showQr = async (label: string, url: string) => { try { const img = await QRCode.toDataURL(url, { width: 320, margin: 1 }); setQr({ label, url, img }); } catch { /* ignore */ } };

  const Link = ({ name, url, k }: { name: string; url: string; k: string }) => (
    <div className="ss-link">
      <span className="ss-linkname">{name}</span>
      <code>{url}</code>
      <button onClick={() => copy(url, k)}>{copied === k ? "Copied" : "Copy"}</button>
      <button onClick={() => showQr(name, url)}>QR</button>
    </div>
  );

  return (
    <div className="ss">
      <div className="ss-head"><div><h1 className="ss-h1">My booking links</h1><p className="ss-sub">Share these so clients can book directly with you. Add them to your email signature, website, or socials.</p></div></div>

      <div className="ss-card">
        <h2>Your booking link</h2>
        <p className="ss-hint">Opens your services and available times, with you already selected.</p>
        <Link name={`Book with ${firstName}`} url={personal} k="personal" />
      </div>

      {types.length > 0 && (
        <div className="ss-card">
          <h2>Links for a specific service</h2>
          <p className="ss-hint">Send a client straight to one service, pre-filled with you as the clinician.</p>
          <Foldable max={6} unit="services">
            <div>
              {types.map((t) => <Link key={t.id} name={t.name} url={`${origin}/book?type=${t.id}&clinician=${clinicianId}`} k={t.id} />)}
            </div>
          </Foldable>
        </div>
      )}

      {qr && (
        <div className="ss-qrmodal" onClick={() => setQr(null)}>
          <div className="ss-qrsheet" onClick={(e) => e.stopPropagation()}>
            <div className="ss-qrname">{qr.label}</div>
            <img src={qr.img} alt={`QR code for ${qr.label}`} width={320} height={320} />
            <p className="ss-hint" style={{ marginTop: 12, wordBreak: "break-all" }}>{qr.url}</p>
            <button className="ss-btn primary" onClick={() => setQr(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
