import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";

export const metadata: Metadata = { title: "Information Security Policy · Cayman Essential Care" };
export const dynamic = "force-dynamic";

const PRACTICE = "Cayman Essential Care";
const CONTACT_EMAIL = "Therapy@caymanessentialcare.com";
const EFFECTIVE = "2 November 2026";

// Internal, staff-facing security policy (HIPAA Security Rule + Cayman DPA).
// Readable by any signed-in staff member; linked from the HIPAA board.
export default async function SecurityPolicyPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/security-policy");

  return (
    <main className="lgl">
      <h1>Information Security Policy</h1>
      <p className="lgl-sub">{PRACTICE} · Internal policy · Effective {EFFECTIVE}</p>

      <p>
        This policy sets out how everyone who works with {PRACTICE} protects the personal and health information we hold.
        It applies to all staff, clinicians, contractors, and anyone else with access to our systems or records
        (&ldquo;workforce&rdquo;). Following it is a condition of having access.
      </p>
      <p>
        We operate in the Cayman Islands, so the <b>Data Protection Act (2021 Revision)</b> is the law that binds us. We
        adopt the U.S. <b>HIPAA Security Rule</b> as our practical framework of administrative, physical, and technical
        safeguards to meet that standard to a high, defensible level.
      </p>

      <h2>1. Roles and responsibilities</h2>
      <ul>
        <li>The practice names a <b>Security &amp; Privacy Officer</b> who owns this policy, handles questions and complaints, and reviews it. (Owner to name the person.)</li>
        <li>Every member of the workforce is responsible for protecting information, following this policy, and reporting anything that looks wrong.</li>
        <li>Access to records is granted on a <b>need-to-know, least-privilege</b> basis for each person&rsquo;s role.</li>
      </ul>

      <h2>2. Administrative safeguards</h2>
      <ul>
        <li><b>Risk assessment:</b> we periodically review where information lives and what could go wrong, and act on the findings.</li>
        <li><b>Access management:</b> accounts are created with the minimum access needed; access is reviewed when roles change and <b>removed promptly when someone leaves</b>.</li>
        <li><b>Training:</b> everyone who touches health information completes basic privacy and security training and signs a confidentiality agreement, with a record kept.</li>
        <li><b>Sanctions:</b> misuse of records or breaking this policy leads to consequences, up to removal of access and termination, and referral where the law requires.</li>
        <li><b>Vendors:</b> any provider that stores or handles information on our behalf must be under a written data-protection / business-associate agreement before it is used.</li>
      </ul>

      <h2>3. Access control and authentication</h2>
      <ul>
        <li>Each person has their <b>own individual login</b>. Accounts and passwords are never shared.</li>
        <li>Passwords are stored only as salted one-way hashes, never as readable text.</li>
        <li><b>Two-step login (MFA)</b> is available to all staff and is strongly recommended, and required, for administrator and owner accounts.</li>
        <li>Sessions <b>log out automatically</b> after a period of inactivity; lock your screen whenever you step away.</li>
        <li>When an administrator &ldquo;views as&rdquo; another person, that view is <b>read-only</b>, so the audit trail always shows who really did what.</li>
      </ul>

      <h2>4. Technical safeguards</h2>
      <ul>
        <li><b>Encryption at rest:</b> sensitive data (names, dates of birth, clinical notes, intake answers, uploaded documents) is stored encrypted with AES-256.</li>
        <li><b>Encryption in transit:</b> data is encrypted while travelling over the internet (TLS).</li>
        <li><b>Audit logging:</b> who opened or changed each record, and when, is recorded; the log itself holds no health details.</li>
        <li><b>Key management:</b> the master encryption key is held only in the host&rsquo;s secure environment, with a written rotation and backup plan, and is never stored in the code.</li>
        <li><b>Minimum necessary:</b> we access and share only the information needed for the task at hand.</li>
      </ul>

      <h2>5. Physical and device safeguards</h2>
      <ul>
        <li>Keep devices used for work locked, password-protected, and up to date.</li>
        <li>Do not store health information on unencrypted personal devices or removable drives.</li>
        <li>Position screens so records are not visible to others, and never leave a signed-in device unattended in public.</li>
        <li>Dispose of any printed records securely (shredding), and wipe devices before disposal.</li>
      </ul>

      <h2>6. Handling and sending information</h2>
      <ul>
        <li>Never put client health details in an email body, a text message, or a web address. Our notifications carry only a secure link that requires a login.</li>
        <li>Share information outside the practice only when permitted, under the minimum-necessary rule, and through approved, secured channels.</li>
        <li>Our hosting is in the United States; treat that as a cross-border transfer handled under our data-protection agreements and client consent.</li>
      </ul>

      <h2>7. Backups and recovery</h2>
      <p>
        The database&rsquo;s automatic backups are kept on, and we confirm periodically that a restore works, so information
        can be recovered if something goes wrong.
      </p>

      <h2>8. If something goes wrong (incident response)</h2>
      <p>
        If you suspect a breach, a lost device, a wrong-recipient disclosure, or any security problem, <b>report it to the
        Security &amp; Privacy Officer immediately</b>. We then contain it, assess what happened, and, where the law
        requires, notify the Office of the Ombudsman (Cayman Islands) and the people affected without undue delay, keeping a
        full written record. This follows our breach-response plan.
      </p>

      <h2>9. Retention and disposal</h2>
      <p>
        We keep records only as long as needed for care and to meet legal and professional obligations, following our
        retention schedule, then dispose of them securely.
      </p>

      <h2>10. Review</h2>
      <p>
        This policy is reviewed at least once a year and whenever there is a significant change to our systems or the law.
      </p>

      <h2>Questions</h2>
      <p>
        Direct any questions to the Security &amp; Privacy Officer at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <p className="lgl-note">
        This is an internal draft prepared in good faith; it is not legal advice. Because the practice is in the Cayman
        Islands, a Cayman-qualified attorney should confirm what applies and approve the final version before it is relied
        upon.
      </p>

      <div className="lgl-foot">© {new Date().getFullYear()} {PRACTICE}. Internal policy.</div>
    </main>
  );
}
