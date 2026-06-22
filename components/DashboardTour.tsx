"use client";

import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "tifec-tour-v1";

interface Step {
  sel: string | null; // CSS selector to spotlight, or null for a centered welcome card
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { sel: null, title: "Welcome to your dashboard 👋", body: "Here's a quick tour of how everything works. It takes about 20 seconds, and you can skip anytime." },
  { sel: ".dm-kpis", title: "Your submissions at a glance", body: "These cards show how many forms are New, Reviewed, or Archived. Tap one to filter the list. You start on New, so you always see what needs review first." },
  { sel: ".dm-search", title: "Find anyone fast", body: "Search your clients by name, email, or form type." },
  { sel: ".dm-row", title: "Open a client", body: "Tap a client to see their full intake, DSM-5 scores, private notes, and any linked forms." },
  { sel: ".dm-nav", title: "Get around", body: "Switch between your Dashboard, your shareable Forms, and Admin (if you have access) here." },
  { sel: ".dm-promo", title: "Need help?", body: "Hit a snag or have an idea? Report it here anytime." },
];

interface Box { top: number; left: number; width: number; height: number }

export default function DashboardTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const [box, setBox] = useState<Box | null>(null);

  const start = useCallback(() => {
    // Only include steps whose target exists right now.
    const present = STEPS.filter((s) => s.sel === null || document.querySelector(s.sel));
    setSteps(present.length ? present : [STEPS[0]]);
    setI(0);
    setOpen(true);
  }, []);

  // Auto-start on first visit; also listen for a manual replay event.
  useEffect(() => {
    const onReplay = () => start();
    window.addEventListener("tifec-tour", onReplay);
    let t: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!localStorage.getItem(SEEN_KEY)) t = setTimeout(start, 600);
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener("tifec-tour", onReplay);
      if (t) clearTimeout(t);
    };
  }, [start]);

  // Position the spotlight on the current step's target.
  useEffect(() => {
    if (!open) return;
    const step = steps[i];
    if (!step || !step.sel) {
      setBox(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(step.sel as string);
      if (!el) {
        setBox(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      // measure after the scroll settles
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      }, 220);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, i, steps]);

  function finish() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  // Tooltip placement.
  const tipW = Math.min(360, (typeof window !== "undefined" ? window.innerWidth : 360) - 32);
  let tipStyle: React.CSSProperties;
  if (box) {
    const vh = window.innerHeight;
    const below = box.top + box.height + 220 < vh;
    const left = Math.min(Math.max(box.left, 16), window.innerWidth - tipW - 16);
    const top = below ? box.top + box.height + 14 : Math.max(16, box.top - 200);
    tipStyle = { position: "fixed", top, left, width: tipW, zIndex: 2002 };
  } else {
    tipStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: tipW, zIndex: 2002 };
  }

  const pad = 8;

  return (
    <>
      {/* click blocker */}
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {/* dim + spotlight */}
      {box ? (
        <div
          className="tour-spot"
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      {/* tooltip */}
      <div className="tour-tip" style={tipStyle}>
        <div className="tour-step">Step {i + 1} of {steps.length}</div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={finish}>
            {last ? "" : "Skip"}
          </button>
          <div className="tour-nav">
            {i > 0 && (
              <button type="button" className="btn-ghost" onClick={() => setI((n) => n - 1)}>Back</button>
            )}
            {last ? (
              <button type="button" className="primary" onClick={finish}>Got it</button>
            ) : (
              <button type="button" className="primary" onClick={() => setI((n) => n + 1)}>Next</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
