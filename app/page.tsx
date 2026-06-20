import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      <div className="card hero">
        <span className="hero-eyebrow">The Institute for Essential Care</span>
        <h1 className="hero-title">Welcome to TIFEC</h1>
        <p className="hero-sub">
          This is our secure portal for client intake forms. Choose the option below that
          applies to you.
        </p>
      </div>

      <div className="door-grid">
        <div className="door-card door-client">
          <div className="door-icon">📝</div>
          <h2 className="door-title">I&apos;m a client</h2>
          <p className="door-text">
            Complete your intake form before your appointment. It only takes a few minutes,
            and your answers are encrypted and shared only with your clinician.
          </p>
          <Link href="/intake">
            <button className="primary primary-lg" style={{ width: "100%" }}>Start intake form →</button>
          </Link>
          <p className="door-note">
            Were you sent a personal link by your clinician? Please use that link instead -
            it routes straight to them.
          </p>
        </div>

        <div className="door-card door-clinician">
          <div className="door-icon">🔒</div>
          <h2 className="door-title">I&apos;m a clinician or staff</h2>
          <p className="door-text">
            Sign in to your dashboard to review new submissions, track their status, add
            private notes, and share your intake links.
          </p>
          <Link href="/login">
            <button className="btn-outline-lg" style={{ width: "100%" }}>Sign in to dashboard →</button>
          </Link>
          <p className="door-note">
            Admins can oversee the whole practice from the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
