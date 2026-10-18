"use client";

import { useState } from "react";
import InstallPrompt from "@/components/InstallPrompt";

const initialsOf = (name: string) => {
  const words = name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};

export default function MobileMe({ name, credentials, bookingUrl }: { name: string; credentials: string; bookingUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(bookingUrl); }
    catch {
      try { const ta = document.createElement("textarea"); ta.value = bookingUrl; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch { /* ignore */ }
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Book an appointment", url: bookingUrl }); return; } catch { /* fell through */ } }
    copy();
  };

  async function signOut() {
    setBusy(true);
    try { document.cookie = "dev_role=; path=/; max-age=0"; document.cookie = "dev_as=; path=/; max-age=0"; await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login?next=/m";
  }

  return (
    <div className="mme">
      <header className="mme-head">
        <div className="mme-av">{initialsOf(name)}</div>
        <div>
          <div className="mme-name">{name}</div>
          {credentials && <div className="mme-cred">{credentials}</div>}
        </div>
      </header>

      <div className="mme-body">
        <InstallPrompt />

        <div className="mme-sec">Your booking link</div>
        <div className="mme-link">{bookingUrl.replace(/^https?:\/\//, "")}</div>
        <div className="mme-linkrow">
          <button className="mme-btn teal" onClick={share}>Share link</button>
          <button className="mme-btn ghost" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        </div>

        <div className="mme-sec">App</div>
        <a className="mme-row" href="/today"><span>Open the full web app</span><span className="mme-chev" aria-hidden="true">›</span></a>
        <button className="mme-row danger" onClick={signOut} disabled={busy}><span>{busy ? "Signing out…" : "Sign out"}</span></button>
      </div>
    </div>
  );
}
