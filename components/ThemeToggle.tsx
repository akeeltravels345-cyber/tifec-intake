"use client";

import { useEffect, useState } from "react";

// Theme choice: Auto (follow the device), Light, or Dark. Stored per browser and
// applied by stamping data-theme on <html> — the initial value is set before
// paint by the inline script in the root layout, so there's no flash.
type Pref = "system" | "light" | "dark";
const KEY = "tifec-theme";

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

const OPTIONS: [Pref, string][] = [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]];

export default function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");

  useEffect(() => {
    let p: Pref = "system";
    try { const s = localStorage.getItem(KEY); if (s === "light" || s === "dark" || s === "system") p = s; } catch { /* storage blocked */ }
    setPref(p);
    // While on Auto, follow the device if it flips light/dark mid-session.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { try { if ((localStorage.getItem(KEY) || "system") === "system") apply("system"); } catch { /* ignore */ } };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function choose(p: Pref) {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
    apply(p);
  }

  return (
    <div className="th-toggle" role="group" aria-label="Appearance">
      <span className="th-lab">Theme</span>
      <div className="th-seg">
        {OPTIONS.map(([p, label]) => (
          <button key={p} type="button" className={`th-opt ${pref === p ? "on" : ""}`} aria-pressed={pref === p} onClick={() => choose(p)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
