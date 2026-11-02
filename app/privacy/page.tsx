import type { Metadata } from "next";

// Public page (no login) so app-store reviewers and clients can reach it.
export const metadata: Metadata = { title: "Privacy Policy · Cayman Essential Care" };

// ---- Edit these to match your practice's legal details ----------------------
const PRACTICE = "Cayman Essential Care";
const CONTACT_EMAIL = "Therapy@caymanessentialcare.com";
const WEBSITE = "caymanessentialcare.com";
const EFFECTIVE = "2 November 2026";

export default function PrivacyPage() {
  return (
    <main className="lgl">
      <h1>Privacy Policy</h1>
      <p className="lgl-sub">{PRACTICE} · Effective {EFFECTIVE}</p>

      <p>
        This Privacy Policy explains how {PRACTICE} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, shares, and
        protects your information in our scheduling, intake, and billing application (the &ldquo;Service&rdquo;). We are a
        mental-health practice, and we treat the information you share with the care that health information deserves.
      </p>
      <p>
        We operate in the Cayman Islands, so this policy is grounded in the <b>Cayman Islands Data Protection Act (2021
        Revision)</b>, which is the law that governs us and is overseen by the Office of the Ombudsman. We also hold
        ourselves to the standards of the U.S. <b>HIPAA</b> Privacy and Security Rules as a best-practice framework for how
        we handle health information.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><b>Appointment details</b> you or your clinician enter: name, email, phone, appointment type, time, and whether the visit is in person or virtual.</li>
        <li><b>Intake information</b> you provide on intake or consent forms, which may include health information relevant to your care.</li>
        <li><b>Billing information</b> such as insurer, policy number, charges, and payments.</li>
        <li><b>Clinician account credentials</b> for staff who sign in (passwords are stored only as salted hashes, never in plain text).</li>
        <li><b>Video connection tokens</b> when a clinician links their own Zoom or Google account so meeting links can be created for their virtual appointments.</li>
      </ul>

      <h2>Our legal basis for handling your health information</h2>
      <p>
        Under the Data Protection Act, health information is &ldquo;sensitive personal data&rdquo; and needs a specific
        condition to be processed. We rely on the provision of medical care by, or under the responsibility of, a
        professional who owes you a duty of confidence, together with your <b>explicit consent</b>, which we ask for at
        intake. You may withdraw consent at any time, subject to the records we are legally required to keep (see Your
        rights below).
      </p>

      <h2>How we use information</h2>
      <ul>
        <li><b>Treatment:</b> to schedule, manage, and remind you about appointments, to prepare your clinician for your care, and to keep clinical records.</li>
        <li><b>Payment:</b> to bill for services and manage insurance and payments.</li>
        <li><b>Operations:</b> to run the practice safely, including quality, security, and administration.</li>
        <li>To create and attach video meeting links for virtual appointments.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use it for advertising.</p>

      <h2>When we may share without your authorization</h2>
      <p>
        We may use or disclose your information without separate authorization only where the law permits or requires it,
        for example: when required by law or legal process; to public-health or regulatory authorities where mandated; to
        report suspected abuse, neglect, or a serious and imminent threat to the health or safety of you or others; and for
        lawful health-oversight activities. We limit any such disclosure to the minimum necessary.
      </p>

      <h2>Uses that need your written authorization</h2>
      <p>
        Any use or disclosure not described in this policy will be made only with your written authorization, which you may
        revoke at any time. In particular, a clinician&rsquo;s private process notes (sometimes called psychotherapy notes)
        are kept separate from your main record and are given extra protection, and we do not sell personal information or
        use it for marketing.
      </p>

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
        Sensitive information, including intake answers and client records, is <b>encrypted at rest</b> (AES-256) and
        <b> encrypted in transit</b> over the internet. Access is restricted to authorized staff on a need-to-know basis,
        clinicians see only their own clients unless they hold an oversight role, every access and change to a record is
        recorded in an audit log, staff sign in with their own accounts, two-step login is available, and staff sessions
        log out automatically after a period of inactivity.
      </p>

      <h2>Where your information is stored (transfers outside the Cayman Islands)</h2>
      <p>
        Our hosting and database run on infrastructure located in the United States, so providing the Service involves
        transferring your information outside the Cayman Islands. We do this under appropriate safeguards: contractual data
        protection terms with those providers, the technical protections described above, and your consent at intake. If
        you have questions about these transfers, contact us using the details below.
      </p>

      <h2>Sharing and service providers</h2>
      <p>
        We share information only as needed to provide the Service, with providers who process data on our behalf under
        written data-protection agreements: our hosting and database provider, our email provider (for appointment and
        billing messages), and the video providers (Zoom and Google) you or your clinician connect. We may also disclose
        information where required by law.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep clinical and billing records for as long as required for your care and to meet our legal and professional
        obligations, and no longer than necessary, then dispose of them securely.
      </p>

      <h2>Your rights</h2>
      <p>Subject to the records we are legally required to keep, you have the right to:</p>
      <ul>
        <li><b>Access</b> and get a copy of the personal information we hold about you (we aim to respond within about 30 days).</li>
        <li><b>Correct or amend</b> information that is inaccurate or incomplete.</li>
        <li><b>Object to or restrict</b> certain uses of your information, and request <b>confidential communications</b> (for example, that we contact you a particular way).</li>
        <li>Request an <b>accounting of certain disclosures</b> we have made.</li>
        <li><b>Withdraw consent</b> you previously gave, and ask us to delete information where we are not required to keep it.</li>
        <li>Receive a <b>paper copy</b> of this policy on request.</li>
        <li>Be <b>notified of a breach</b> that affects your information.</li>
      </ul>

      <h2>How to exercise your rights, and how to complain</h2>
      <p>
        To exercise any of these rights, contact us at the address below and we will respond. A clinician may disconnect a
        linked Zoom or Google account at any time from within the Service. If you are not satisfied with how we have handled
        your information, you may complain to us, and you also have the right to complain to the <b>Office of the Ombudsman
        (Cayman Islands)</b> (ombudsman.ky). We will never retaliate against you for making a complaint or exercising your
        rights.
      </p>

      <h2>If information is ever exposed</h2>
      <p>
        If a breach affects your personal information, we will act on it without undue delay, including notifying the Office
        of the Ombudsman and the people affected where the law requires, in line with our breach-response plan.
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
        {PRACTICE} · Privacy contact<br />
        Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />
        Web: <a href={`https://${WEBSITE}`} target="_blank" rel="noopener noreferrer">{WEBSITE}</a>
      </p>

      <p className="lgl-note">
        This notice is an internal draft prepared in good faith; it is not legal advice. Because the practice is in the
        Cayman Islands, a Cayman-qualified attorney should confirm what applies and approve the final version before it is
        relied upon.
      </p>

      <div className="lgl-foot">© {new Date().getFullYear()} {PRACTICE}. All rights reserved.</div>
    </main>
  );
}
