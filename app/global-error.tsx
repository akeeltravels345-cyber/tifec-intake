"use client";

import ReportBroken from "@/components/ReportBroken";

// Last-resort boundary for an error thrown in the root layout itself. It
// replaces the whole document, so it must render its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ maxWidth: 520, margin: "80px auto", padding: 24 }}>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h2>
          <p style={{ color: "#6B7580", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
            We hit an unexpected error and have automatically reported it to the team.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ border: "1px solid #ECE6DA", background: "#fff", borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
        <ReportBroken kind="error" message={`root: ${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`} />
      </body>
    </html>
  );
}
