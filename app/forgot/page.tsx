import ForgotForm from "./ForgotForm";

export const dynamic = "force-dynamic";

export default function ForgotPage() {
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
          <ForgotForm />
        </div>
      </div>
    </div>
  );
}
