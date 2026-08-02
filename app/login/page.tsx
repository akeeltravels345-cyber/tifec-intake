import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; timeout?: string }>;
}) {
  const { next, timeout } = await searchParams;
  const me = await getCurrentClinician();
  // Only allow internal relative redirect targets.
  const safeNext = next && next.startsWith("/") ? next : "/today";
  if (me) redirect(safeNext);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <aside className="auth-brand">
          <div className="auth-brand-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tifec-logo.png" alt="Institute for Essential Care" className="auth-logo-img" />
            <p className="auth-brand-tag">Clinician portal · secure client intake</p>
            <ul className="auth-points">
              <li><span>🔒</span> Encrypted, confidential client records</li>
              <li><span>📋</span> Your own dashboard and intake forms</li>
              <li><span>✓</span> Protected access - every view is logged</li>
            </ul>
          </div>
        </aside>

        <div className="auth-panel">
          {timeout && (
            <p className="auth-timeout-note">
              You were signed out after a period of inactivity. Please sign in again.
            </p>
          )}
          <LoginForm next={safeNext} />
        </div>
      </div>
    </div>
  );
}
