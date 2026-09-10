import type { Metadata } from "next";

// Public page (no login) so app-store reviewers and clients can reach it.
export const metadata: Metadata = { title: "Privacy Policy · Cayman Essential Care" };

// ---- Edit these to match your practice's legal details ----------------------
const PRACTICE = "Cayman Essential Care";
const CONTACT_EMAIL = "Therapy@caymanessentialcare.com";
const WEBSITE = "caymanessentialcare.com";
const EFFECTIVE = "10 September 2026";

export default function PrivacyPage() {
  return (
    <main className="lgl">
      <h1>Privacy Policy</h1>
      <p className="lgl-sub">{PRACTICE} · Effective {EFFECTIVE}</p>

      <p>
        This Privacy Policy explains how {PRACTICE} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and protects
        information in our scheduling, intake, and billing application (the &ldquo;Service&rdquo;). We are a mental-health
        practice, and we treat the information you share with the care that health information deserves.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><b>Appointment details</b> you or your clinician enter: name, email, phone, appointment type, time, and whether the visit is in person or virtual.</li>
        <li><b>Intake information</b> you provide on intake or consent forms, which may include health information relevant to your care.</li>
        <li><b>Billing information</b> such as insurer, policy number, charges, and payments.</li>
        <li><b>Clinician account credentials</b> for staff who sign in (passwords are stored only as salted hashes, never in plain text).</li>
        <li><b>Video connection tokens</b> when a clinician links their own Zoom or Google account so meeting links can be created for their virtual appointments.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To schedule, manage, and remind you about your appointments.</li>
        <li>To prepare your clinician for your care and to keep clinical records.</li>
        <li>To bill for services and manage insurance and payments.</li>
        <li>To create and attach video meeting links for virtual appointments.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use it for advertising.</p>

      <h2>Video meetings (Zoom and Google)</h2>
      <p>
        When a clinician connects their own Zoom or Google account, the Service uses that connection only to create a
        meeting for a virtual appointment (its topic, date, time, and duration) and to remove that meeting if the
        appointment is cancelled. Access tokens are stored securely and used solely for this purpose.
      </p>
      <p>
        Our use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
        including its Limited Use requirements. We access a clinician&rsquo;s Google Calendar only to create and cancel the
        meetings for their appointments; we do not read other calendar data, and we do not transfer or use this data for
        any other purpose.
      </p>

      <h2>How we protect information</h2>
      <p>
        Sensitive information, including intake answers and client records, is encrypted at rest. Access is restricted to
        authorized staff, clinicians see only their own clients unless they hold an oversight role, and staff sessions log
        out automatically after a period of inactivity.
      </p>

      <h2>Sharing and service providers</h2>
      <p>
        We share information only as needed to provide the Service, with providers who process data on our behalf: our
        hosting and database provider, our email provider (for appointment and billing messages), and the video providers
        (Zoom and Google) you or your clinician connect. We may also disclose information where required by law.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep clinical and billing records for as long as required for your care and to meet our legal and professional
        obligations, then dispose of them securely.
      </p>

      <h2>Your choices</h2>
      <p>
        You may ask us to access, correct, or delete your personal information, subject to the records we are required to
        keep. Contact us at the address below. A clinician may disconnect a linked Zoom or Google account at any time from
        within the Service.
      </p>

      <h2>Children</h2>
      <p>
        Where we provide care to minors, information is handled with the involvement of a parent or guardian as
        appropriate. The Service is not directed to children for independent use.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy from time to time; the effective date above reflects the current version.</p>

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
