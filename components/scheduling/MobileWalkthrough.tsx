"use client";

import { useEffect, useState } from "react";

// A first-run guided tour of the mobile app. Shows once (remembered in
// localStorage) and can be replayed from Me (/m?tour=1). A stepped card
// carousel rather than coach-marks, so it works regardless of what's on screen.
export const WT_KEY = "m-walkthrough-v1";

type Step = { tint: string; icon: React.ReactNode; title: string; body: string };

const I = (p: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
);

const STEPS: Step[] = [
  { tint: "t1", title: "Your schedule, in your pocket", body: "Your sessions, bookings and reminders, all in one place and right on your phone.", icon: I(<><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>) },
  { tint: "t1", title: "Your day at a glance", body: "The Today grid lays out every session. Tap one for quick actions, or open it for the full details.", icon: I(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M7 13h7M7 17h4" /></>) },
  { tint: "t2", title: "Jump between days", body: "Tap any day in the strip, or use the arrows to move a week at a time. The Today pill brings you straight back.", icon: I(<><path d="M15 6l-6 6 6 6" /><path d="M9 6" /><rect x="2" y="3" width="4" height="18" rx="1" opacity="0" /></>) },
  { tint: "t1", title: "Book or block in seconds", body: "Tap the + button to book an appointment for a client, or block off time like lunch or leave.", icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>) },
  { tint: "t2", title: "See any schedule", body: "Tap 'My schedule' to view a colleague's day instead. Your pick sticks as you move between Today and Calendar.", icon: I(<><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.2 2.9-4.8 6.5-4.8s6.5 1.6 6.5 4.8" /><path d="M16.5 5.4a3 3 0 0 1 0 5.6M21.5 20c0-2.4-1.5-3.9-3.8-4.4" /></>) },
  { tint: "t3", title: "Never miss a booking", body: "The Inbox collects new bookings, changes and reminders. Turn on alerts to get them pushed to your phone.", icon: I(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>) },
];

export default function MobileWalkthrough({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;

  const finish = () => {
    try { localStorage.setItem(WT_KEY, "done"); } catch { /* ignore */ }
    onClose();
  };

  // Lock body scroll while the tour is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const s = STEPS[i];
  return (
    <div className="mwt" role="dialog" aria-modal="true" aria-label="App walkthrough">
      <button className="mwt-skip" onClick={finish}>Skip</button>
      <div className="mwt-body">
        <div className={`mwt-ic ${s.tint}`}>{s.icon}</div>
        <h2 className="mwt-title">{s.title}</h2>
        <p className="mwt-text">{s.body}</p>
      </div>
      <div className="mwt-foot">
        <div className="mwt-dots" aria-hidden="true">
          {STEPS.map((_, n) => <span key={n} className={n === i ? "on" : ""} />)}
        </div>
        <div className="mwt-btns">
          {i > 0 && <button className="mbtn ghost" onClick={() => setI(i - 1)}>Back</button>}
          <button className="mbtn primary block" onClick={() => (last ? finish() : setI(i + 1))}>{last ? "Get started" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
