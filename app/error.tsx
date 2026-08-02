"use client";

import { useEffect } from "react";
import Link from "next/link";
import ReportBroken from "@/components/ReportBroken";

// Catches an unexpected runtime error on any page, shows a calm message, and
// auto-reports it to the team (with the error message + digest).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container container-narrow">
      <div className="card">
        <h2 className="section-title">Something went wrong on this page</h2>
        <p className="muted">
          We hit an unexpected error and have automatically reported it to the team. You can try again, or
          head back.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: "1px solid var(--edge, #ECE6DA)", background: "#fff", borderRadius: 10,
              padding: "9px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link href="/today" className="back-link">← Back to Today</Link>
        </div>
      </div>
      <ReportBroken kind="error" message={`${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`} />
    </div>
  );
}
