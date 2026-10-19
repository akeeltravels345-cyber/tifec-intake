"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

// "Whose schedule" selector for the mobile app — mirrors the web calendar's
// clinician chips. Picking a colleague (or Everyone) reloads the current screen
// with ?who=, which the page uses to fetch that schedule. Viewing is allowed for
// everyone; editing stays gated to your own appointments on the detail screen.
export default function MobileWhoPicker({ clinicians, who, myId }: { clinicians: { id: string; name: string }[]; who: string; myId: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname() || "/m";
  const label = who === "all" ? "Everyone" : who === myId ? "My schedule" : (clinicians.find((c) => c.id === who)?.name || "Schedule");
  const go = (w: string) => { window.location.href = `${path}?who=${encodeURIComponent(w)}`; };

  return (
    <>
      <button className="mwho" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.3 3.1-5 7-5s7 1.7 7 5" /></svg>
        <span>{label}</span>
        <span className="mwho-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="msheet-ov" onClick={() => setOpen(false)}>
          <div className="msheet" onClick={(e) => e.stopPropagation()}>
            <div className="msheet-grab" aria-hidden="true" />
            <div className="msheet-title">Whose schedule</div>
            <div className="mwho-list">
              <button className={`mwho-opt${who === myId ? " on" : ""}`} onClick={() => go(myId)}>My schedule {who === myId && <span aria-hidden="true">✓</span>}</button>
              <button className={`mwho-opt${who === "all" ? " on" : ""}`} onClick={() => go("all")}>Everyone {who === "all" && <span aria-hidden="true">✓</span>}</button>
              {clinicians.filter((c) => c.id !== myId).map((c) => (
                <button key={c.id} className={`mwho-opt${who === c.id ? " on" : ""}`} onClick={() => go(c.id)}>{c.name} {who === c.id && <span aria-hidden="true">✓</span>}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
