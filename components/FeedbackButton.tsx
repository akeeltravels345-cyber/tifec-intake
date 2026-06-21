"use client";

import { useState } from "react";

const CATS = ["Bug", "Question", "Suggestion"];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("Bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  function close() {
    setOpen(false);
    setTimeout(() => {
      setStatus("idle");
      setMessage("");
      setCategory("Bug");
      setError("");
    }, 200);
  }

  async function submit() {
    if (!message.trim()) {
      setError("Please describe the issue.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, message }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Could not send. Please try again.");
      }
      setStatus("done");
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "Could not send. Please try again.");
    }
  }

  return (
    <>
      <button type="button" className="dm-report" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Report an issue
      </button>

      {open && (
        <div className="fb-overlay" onClick={close} role="dialog" aria-modal="true">
          <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
            {status === "done" ? (
              <div className="fb-done">
                <div className="fb-check">✓</div>
                <h3 className="fb-title">Thanks — report sent</h3>
                <p className="fb-sub">We&apos;ve received it and will look into it.</p>
                <button type="button" className="primary" onClick={close}>Close</button>
              </div>
            ) : (
              <>
                <h3 className="fb-title">Report an issue</h3>
                <p className="fb-sub">
                  Tell us what&apos;s not working or could be better. Please don&apos;t include client names or personal details.
                </p>
                <div className="fb-label">Type</div>
                <div className="fb-cats">
                  {CATS.map((c) => (
                    <button key={c} type="button" className={`fb-cat ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
                      {c}
                    </button>
                  ))}
                </div>
                <div className="fb-label">What happened?</div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Describe the issue or idea…"
                  autoFocus
                />
                {error && <p className="fb-error">{error}</p>}
                <div className="fb-actions">
                  <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
                  <button type="button" className="primary" onClick={submit} disabled={status === "sending"}>
                    {status === "sending" ? "Sending…" : "Send report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
