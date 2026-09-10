import type { Metadata } from "next";

// Public page (no login) so app-store reviewers and clients can reach it.
export const metadata: Metadata = { title: "Terms of Use · Cayman Essential Care" };

// ---- Edit these to match your practice's legal details ----------------------
const PRACTICE = "Cayman Essential Care";
const CONTACT_EMAIL = "Therapy@caymanessentialcare.com";
const WEBSITE = "caymanessentialcare.com";
const JURISDICTION = "the Cayman Islands";
const EFFECTIVE = "10 September 2026";

export default function TermsPage() {
  return (
    <main className="lgl">
      <h1>Terms of Use</h1>
      <p className="lgl-sub">{PRACTICE} · Effective {EFFECTIVE}</p>

      <p>
        These Terms govern your use of the scheduling, intake, and billing application (the &ldquo;Service&rdquo;) provided
        by {PRACTICE} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the Service, you agree to these Terms.
      </p>

      <h2>The Service</h2>
      <p>
        The Service lets clients book appointments and complete intake, and lets our clinicians and staff manage
        schedules, clinical intake, video meeting links, and billing. It supports our care; it is not itself a medical
        device or a substitute for professional judgment.
      </p>

      <h2>Not for emergencies</h2>
      <p>
        The Service is not for urgent or emergency needs. If you are in crisis or think you may harm yourself or others,
        do not use this application; contact your local emergency services or a crisis line immediately.
      </p>

      <h2>Appointments and cancellations</h2>
      <p>
        Appointments are subject to our scheduling and cancellation policy, which is shown when you book. Please give
        reasonable notice to change or cancel a visit so we can offer the time to someone else.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Provide accurate information and keep your contact details current.</li>
        <li>Use the Service only for its intended purpose and for lawful reasons.</li>
        <li>Do not attempt to access accounts, records, or data that are not yours, or to disrupt the Service.</li>
      </ul>

      <h2>Staff accounts</h2>
      <p>
        Clinician and staff accounts are personal to the individual. You are responsible for keeping your password
        confidential and for activity under your account.
      </p>

      <h2>Connected video accounts</h2>
      <p>
        A clinician may connect their own Zoom or Google account so meeting links are created for their virtual
        appointments. Your use of those services is also subject to Zoom&rsquo;s and Google&rsquo;s own terms. You can
        disconnect a linked account at any time from within the Service.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        The Service is provided on an &ldquo;as is&rdquo; basis. To the extent permitted by law, we are not liable for
        indirect or consequential loss arising from your use of the Service. Nothing in these Terms limits liability that
        cannot be limited by law, or affects the professional obligations we owe you in your care.
      </p>

      <h2>Governing law</h2>
      <p>These Terms are governed by the laws of {JURISDICTION}.</p>

      <h2>Changes</h2>
      <p>We may update these Terms from time to time; the effective date above reflects the current version.</p>

      <h2>Contact us</h2>
      <p>
        {PRACTICE}<br />
        Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />
        Web: <a href={`https://${WEBSITE}`} target="_blank" rel="noopener noreferrer">{WEBSITE}</a>
      </p>

      <div className="lgl-foot">© {new Date().getFullYear()} {PRACTICE}. All rights reserved.</div>
    </main>
  );
}
