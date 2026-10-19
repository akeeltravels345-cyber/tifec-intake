"use client";

import { useState } from "react";

const initialsOf = (name: string) => {
  const w = name.replace(/^\s*(dr|mr|mrs|ms|mx|prof)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return w.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};

type Theme = "light" | "dark" | "system";

export default function MobileMe({ name, role, bookingUrl, theme }: { name: string; role: string; bookingUrl: string; theme: Theme }) {
  const [copied, setCopied] = useState(false);
  const [th, setTh] = useState<Theme>(theme);
  const [signing, setSigning] = useState(false);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(bookingUrl); }
    catch { try { const ta = document.createElement("textarea"); ta.value = bookingUrl; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch { /* ignore */ } }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const shareLink = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Book an appointment", url: bookingUrl }); return; } catch { /* fall through */ } }
    copyLink();
  };
  const setTheme = (next: Theme) => {
    setTh(next);
    const root = document.querySelector(".mapp") as HTMLElement | null;
    if (root) { if (next === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", next); }
    try {
      if (next === "system") document.cookie = "m-theme=; path=/; max-age=0";
      else document.cookie = `m-theme=${next}; path=/; max-age=31536000`;
    } catch { /* ignore */ }
  };
  const signOut = async () => {
    setSigning(true);
    try { document.cookie = "dev_role=; path=/; max-age=0"; document.cookie = "dev_as=; path=/; max-age=0"; await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login?next=/m";
  };

  return (
    <div className="mme">
      <header className="mme-head">
        <div className="mme-eyebrow">ACCOUNT</div>
        <div className="mme-id">
          <span className="mme-av">{initialsOf(name)}</span>
          <span><span className="mme-name">{name}</span><span className="mme-role">{role}</span></span>
        </div>
      </header>

      <div className="mme-body">
        <div className="mcard mme-link">
          <div className="mme-link-lb">Your booking link</div>
          <div className="mme-link-url">{bookingUrl.replace(/^https?:\/\//, "")}</div>
          <div className="mme-link-row">
            <button className="mbtn primary" onClick={shareLink}>Share link</button>
            <button className="mbtn ghost" onClick={copyLink}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>

        <div className="mcard mme-appearance">
          <div className="mme-row-lb">Appearance</div>
          <div className="mseg" role="group" aria-label="Appearance">
            {(["light", "dark", "system"] as Theme[]).map((v) => (
              <button key={v} type="button" className={th === v ? "on" : ""} onClick={() => setTheme(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>

        <div className="mme-rows">
          <a className="mrow" href="/m/hours"><span className="mrow-ic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><span className="mrow-t">Hours &amp; availability</span><span className="mrow-chev" aria-hidden="true">›</span></a>
          <a className="mrow" href="/m?setup=1"><span className="mrow-ic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg></span><span className="mrow-t">Set up your schedule</span><span className="mrow-chev" aria-hidden="true">›</span></a>
          <a className="mrow" href="/today"><span className="mrow-ic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg></span><span className="mrow-t">Open the full web app</span><span className="mrow-chev" aria-hidden="true">›</span></a>
          <button className="mrow danger" onClick={signOut} disabled={signing}><span className="mrow-ic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg></span><span className="mrow-t">{signing ? "Signing out…" : "Sign out"}</span></button>
        </div>
      </div>
    </div>
  );
}
