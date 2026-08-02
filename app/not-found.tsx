import Link from "next/link";
import ReportBroken from "@/components/ReportBroken";

// Friendly 404 for any unmatched route or notFound() call. Auto-reports the
// broken path so a dead link gets fixed instead of silently frustrating people.
export default function NotFound() {
  return (
    <div className="container container-narrow">
      <div className="card">
        <h2 className="section-title">Page not found</h2>
        <p className="muted">
          That page doesn&apos;t exist or may have moved. The team has been notified automatically, so any
          broken link can be fixed.
        </p>
        <Link href="/today" className="back-link">← Back to Today</Link>
      </div>
      <ReportBroken kind="404" />
    </div>
  );
}
