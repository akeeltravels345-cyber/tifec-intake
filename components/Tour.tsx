"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SEEN = "tifec-tour-v1";
const ACTIVE = "tifec-tour-active";
const STEP = "tifec-tour-step";

type Mount = "dashboard" | "record";
type StepPage = "dashboard" | "dashboard-forms" | "record";
interface Step { page: StepPage; sel: string | null; title: string; body: string; optional?: boolean }

// One ordered tour that spans the dashboard, a real client record, and the Forms tab.
const STEPS: Step[] = [
  { page: "dashboard", sel: null, title: "Welcome to your dashboard 👋", body: "A quick tour of the essentials - including opening a client and sending forms. Under a minute, and you can skip anytime." },
  { page: "dashboard", sel: ".dm-kpis", title: "Your submissions at a glance", body: "These cards show how many forms are New, Reviewed, or Archived. Tap one to filter. You start on New, so you always see what needs review first." },
  { page: "dashboard", sel: ".dm-search", title: "Find anyone fast", body: "Search your clients by name, email, or form type." },
  { page: "dashboard", sel: ".dm-row", title: "Open a client", body: "Tap any client to open their full record. Let's open one now — click Next." },
  { page: "record", sel: ".snapshot", title: "The client record", body: "Up top you'll see the client's name, date of birth, and contact details." },
  { page: "record", sel: ".tour-status", title: "Track each form", body: "Mark a submission New, Reviewed, or Archived as you work through it." },
  { page: "record", sel: ".dsm-grid", optional: true, title: "Automatic scoring", body: "DSM-5 answers are scored and flagged for you — no manual tallying." },
  { page: "record", sel: ".tour-notes", title: "Private notes", body: "Add notes only you can see. They're encrypted and never shown to the client." },
  { page: "record", sel: ".tour-linked", optional: true, title: "Linked forms", body: "A client's other forms (e.g. their intake and their DSM-5) are linked here automatically." },
  { page: "record", sel: ".tour-print", title: "Print or save a PDF", body: "Export a clean PDF of the record for your files." },
  { page: "dashboard-forms", sel: ".dm-content .form-card", title: "Send a form to a client", body: "Here's how clients get a form: open Forms, hit Copy link, and send it to them. Completed forms come back to your dashboard." },
  { page: "dashboard", sel: null, title: "You're all set 🎉", body: "That's the tour. Replay it anytime from “Take a tour” in the sidebar." },
];

interface Box { top: number; left: number; width: number; height: number }

export default function Tour({ mount, tourToken }: { mount: Mount; tourToken?: string }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const persist = (a: boolean, s: number) => { try { localStorage.setItem(ACTIVE, a ? "1" : "0"); localStorage.setItem(STEP, String(s)); } catch {} };
  const start = useCallback(() => { persist(true, 0); setActive(true); setIdx(0); }, []);
  const go = useCallback((n: number) => { persist(true, n); setIdx(n); }, []);
  const finish = useCallback(() => { try { localStorage.setItem(SEEN, "1"); localStorage.removeItem(ACTIVE); localStorage.removeItem(STEP); } catch {} setActive(false); }, []);

  const here = (st: Step) => (mount === "dashboard" ? st.page === "dashboard" || st.page === "dashboard-forms" : st.page === "record");

  // init from storage + listen for manual replay; auto-start on first dashboard load
  useEffect(() => {
    let a = false, s = 0;
    try { a = localStorage.getItem(ACTIVE) === "1"; s = parseInt(localStorage.getItem(STEP) || "0", 10) || 0; } catch {}
    setActive(a);
    setIdx(s);
    const onReplay = () => start();
    window.addEventListener("tifec-tour", onReplay);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (mount === "dashboard") {
      try { if (!localStorage.getItem(SEEN) && !a) t = setTimeout(start, 600); } catch {}
    }
    return () => { window.removeEventListener("tifec-tour", onReplay); if (t) clearTimeout(t); };
  }, [mount, start]);

  // driver: navigate between pages, switch dashboard view, spotlight the target
  useEffect(() => {
    if (!active) return;
    const st = STEPS[idx];
    if (!st) { finish(); return; }

    if (!here(st)) {
      if (mount === "dashboard" && st.page === "record") {
        if (tourToken) router.push(`/submissions/${tourToken}`);
        else { let n = idx; while (n < STEPS.length && STEPS[n].page === "record") n++; go(n); }
      } else if (mount === "record") {
        router.push("/dashboard");
      }
      return;
    }

    if (st.page === "dashboard-forms") window.dispatchEvent(new CustomEvent("tifec-set-view", { detail: "forms" }));
    else if (st.page === "dashboard") window.dispatchEvent(new CustomEvent("tifec-set-view", { detail: "dashboard" }));

    let cancelled = false;
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      if (!st.sel) { setBox(null); return; }
      const el = document.querySelector(st.sel);
      if (!el) {
        if (st.optional) { go(idx + 1); return; }
        if (tries++ < 12) { setTimeout(attempt, 150); return; }
        setBox(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => { if (!cancelled) { const r = el.getBoundingClientRect(); setBox({ top: r.top, left: r.left, width: r.width, height: r.height }); } }, 240);
    };
    const startT = setTimeout(attempt, 60);
    const onResize = () => attempt();
    window.addEventListener("resize", onResize);
    return () => { cancelled = true; clearTimeout(startT); window.removeEventListener("resize", onResize); };
  }, [active, idx, mount, tourToken, router, go, finish]);

  if (!active) return null;
  const st = STEPS[idx];
  if (!st || !here(st)) return null;

  const isLast = idx === STEPS.length - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const tipW = Math.min(360, vw - 32);
  let tipStyle: React.CSSProperties;
  if (box) {
    const below = box.top + box.height + 230 < vh;
    const left = Math.min(Math.max(box.left, 16), vw - tipW - 16);
    const top = below ? box.top + box.height + 14 : Math.max(16, box.top - 210);
    tipStyle = { position: "fixed", top, left, width: tipW, zIndex: 2002 };
  } else {
    tipStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: tipW, zIndex: 2002 };
  }
  const pad = 8;

  return (
    <>
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {box ? (
        <div className="tour-spot" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-tip" style={tipStyle}>
        <div className="tour-step">Step {idx + 1} of {STEPS.length}</div>
        <h3 className="tour-title">{st.title}</h3>
        <p className="tour-body">{st.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={finish}>{isLast ? "" : "Skip"}</button>
          <div className="tour-nav">
            {idx > 0 && <button type="button" className="btn-ghost" onClick={() => go(idx - 1)}>Back</button>}
            {isLast ? (
              <button type="button" className="primary" onClick={finish}>Got it</button>
            ) : (
              <button type="button" className="primary" onClick={() => go(idx + 1)}>Next</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
