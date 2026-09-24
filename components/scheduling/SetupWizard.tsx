"use client";

import { useState } from "react";
import CalendarSubscribe from "./CalendarSubscribe";
import BusyFeeds from "./BusyFeeds";

type Provider = "zoom" | "google";
interface Conn { provider: Provider; accountEmail: string; preferred: boolean }

// A friendly, one-thing-at-a-time setup flow for clinicians. Deliberately plain
// and large: many of our clinicians are not comfortable with computers, so each
// screen says what it does, in everyday words, with one big button.
export default function SetupWizard({
  conns, configured, zoomComingSoon, feedUrl, busyFeeds, googleConnected, notice,
}: {
  conns: Conn[];
  configured: { zoom: boolean; google: boolean };
  zoomComingSoon: boolean;
  feedUrl: string;
  busyFeeds: string[];
  googleConnected: boolean;
  notice: { connected: string; error: string };
}) {
  // Screens: 0 welcome · 1 video · 2 calendar · 3 busy (optional) · 4 done.
  // If they just came back from connecting a video account, open on that screen.
  const [step, setStep] = useState<number>(notice.connected || notice.error ? 1 : 0);
  const connOf = (p: Provider) => conns.find((c) => c.provider === p) || null;

  const LABELS = ["Welcome", "Video calls", "Your calendar", "Busy times", "All done"];
  const totalSteps = 3; // the three real steps (video / calendar / busy)
  const stepNo = step >= 1 && step <= 3 ? step : null;

  const Note = () =>
    notice.error ? <p className="wiz-note err">{notice.error}</p> :
    notice.connected ? <p className="wiz-note ok">Connected {notice.connected === "zoom" ? "Zoom" : "Google Meet"}. Nicely done.</p> :
    null;

  const ProviderRow = ({ p, name, blurb }: { p: Provider; name: string; blurb: string }) => {
    const conn = connOf(p);
    const soon = p === "zoom" && zoomComingSoon;
    return (
      <div className={`wiz-prov ${conn ? "on" : ""}`}>
        <div className="wiz-prov-top">
          <span className="wiz-prov-name">{name}</span>
          {conn ? <span className="wiz-pill ok">Connected</span> : soon ? <span className="wiz-pill soon">Coming soon</span> : null}
        </div>
        <p className="wiz-prov-blurb">{blurb}</p>
        {conn ? (
          <div className="wiz-prov-done">✓ Linked to <b>{conn.accountEmail || "your account"}</b></div>
        ) : soon ? (
          <div className="wiz-prov-wait">You will be able to connect this here soon.</div>
        ) : configured[p] ? (
          <a className="wiz-btn big" href={`/api/scheduling/video/connect?provider=${p}&next=/schedule/setup`}>Connect {name}</a>
        ) : (
          <div className="wiz-prov-wait">Not set up on the server yet. Ask your admin to switch it on.</div>
        )}
      </div>
    );
  };

  return (
    <div className="wiz">
      {/* Progress */}
      <div className="wiz-progress" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`wiz-dot ${stepNo && n <= stepNo ? "on" : ""} ${stepNo === n ? "here" : ""}`} />
        ))}
      </div>
      {stepNo && <div className="wiz-stepno">Step {stepNo} of {totalSteps} · {LABELS[step]}</div>}

      {/* 0 — Welcome */}
      {step === 0 && (
        <div className="wiz-screen">
          <h1 className="wiz-h1">Let’s get you set up</h1>
          <p className="wiz-lead">Two quick things, about three minutes. You can stop and come back any time.</p>
          <ul className="wiz-list">
            <li><b>Video calls</b> — when a client books an online session, we make the Zoom or Google Meet link for you and put it in their confirmation. You never make or send one.</li>
            <li><b>Your calendar</b> — your TIFEC appointments show up in the calendar you already use on your phone or computer, so you can see your day without opening this portal.</li>
          </ul>
          <button className="wiz-btn big" onClick={() => setStep(1)}>Start →</button>
        </div>
      )}

      {/* 1 — Video */}
      {step === 1 && (
        <div className="wiz-screen">
          <h1 className="wiz-h1">Set up your video calls</h1>
          <p className="wiz-lead">Pick the app you already use for video. From then on, whenever a client books an <b>online</b> session, we create the meeting link and add it to their confirmation email for you — you never have to make or send one. You only do this once.</p>
          <Note />
          <div className="wiz-provs">
            <ProviderRow p="google" name="Google Meet" blurb="Best if you use a Google (Gmail) account." />
            <ProviderRow p="zoom" name="Zoom" blurb="Best if you already run your sessions on Zoom." />
          </div>
          <p className="wiz-tip">You don’t need both. One is plenty.</p>
          <div className="wiz-nav">
            <button className="wiz-btn ghost" onClick={() => setStep(0)}>← Back</button>
            <button className="wiz-btn" onClick={() => setStep(2)}>{conns.length ? "Next →" : "Skip for now →"}</button>
          </div>
        </div>
      )}

      {/* 2 — Calendar */}
      {step === 2 && (
        <div className="wiz-screen">
          <h1 className="wiz-h1">See your appointments in your own calendar</h1>
          <p className="wiz-lead">Add your TIFEC schedule to the calendar app you already use. Your appointments show up there next to everything else and update themselves — so you always know your day without opening this portal. Tap the button for your calendar:</p>
          <div className="wiz-embed"><CalendarSubscribe url={feedUrl} embedded /></div>
          <p className="wiz-tip">On a phone, tap the button then tap <b>Subscribe</b> or <b>Add</b> when it asks. It’s just for you — no need to share the link.</p>
          <div className="wiz-nav">
            <button className="wiz-btn ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="wiz-btn" onClick={() => setStep(3)}>Next →</button>
          </div>
        </div>
      )}

      {/* 3 — Busy times (optional) */}
      {step === 3 && (
        <div className="wiz-screen">
          <h1 className="wiz-h1">Don’t get booked when you’re already busy <span className="wiz-opt">(optional)</span></h1>
          <p className="wiz-lead">Do you keep your own calendar for the rest of your life — say a personal Google or Outlook calendar? Connect it here and the booking page will automatically skip any time you’re busy there, so no client can book you during your own appointments or a day off. If you only use TIFEC, just skip this.</p>
          <div className="wiz-embed"><BusyFeeds initialFeeds={busyFeeds} googleConnected={googleConnected} embedded /></div>
          <div className="wiz-nav">
            <button className="wiz-btn ghost" onClick={() => setStep(2)}>← Back</button>
            <button className="wiz-btn" onClick={() => setStep(4)}>Finish →</button>
          </div>
        </div>
      )}

      {/* 4 — Done */}
      {step === 4 && (
        <div className="wiz-screen">
          <div className="wiz-tick">✓</div>
          <h1 className="wiz-h1">You’re all set</h1>
          <ul className="wiz-summary">
            <li>{conns.length ? `Video: ${conns.map((c) => (c.provider === "zoom" ? "Zoom" : "Google Meet")).join(" + ")} connected` : "Video: not connected yet — you can do this any time"}</li>
            <li>Calendar: if you tapped an add button, your appointments are syncing</li>
          </ul>
          <p className="wiz-lead">You can change any of this later from <b>Settings</b> on your calendar.</p>
          <div className="wiz-nav center">
            <a className="wiz-btn big" href="/schedule">Go to my calendar →</a>
          </div>
        </div>
      )}
    </div>
  );
}
