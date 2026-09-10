import type { Metadata } from "next";

// Public page (no login) so Zoom/Google reviewers and clinicians can read it.
export const metadata: Metadata = { title: "Connecting video for appointments · Cayman Essential Care" };

const CONTACT_EMAIL = "Therapy@caymanessentialcare.com";

export default function VideoDocsPage() {
  return (
    <main className="lgl">
      <h1>Connecting video for your appointments</h1>
      <p className="lgl-sub">How to add, use, and remove Zoom and Google Meet in the Cayman Essential Care scheduling app</p>

      <p>
        Your schedule can create a Zoom or Google Meet link automatically for each of your virtual appointments, using
        your own account. This guide explains how to connect it, how it works, and how to remove it.
      </p>

      <h2>Adding the app (connect your account)</h2>
      <ul>
        <li>Sign in to the scheduling app.</li>
        <li>Go to <b>My Schedule</b>, then click <b>Video</b> in the toolbar.</li>
        <li>Click <b>Connect Zoom</b> (or <b>Connect Google</b>).</li>
        <li>Approve the authorization on the provider&rsquo;s screen. For Google, tick the Calendar permission when asked.</li>
        <li>You return to the <b>Video connections</b> page showing your account as <b>Connected</b>. If you connect both Zoom and Google, choose which one is the <b>Default</b> for your virtual sessions.</li>
      </ul>

      <h2>Using it</h2>
      <p>
        Once connected, whenever a virtual appointment is booked with you, the app creates a meeting on your own account
        and attaches the join link to that appointment. You and the client use that link to join. When an appointment is
        cancelled or deleted, the app removes the meeting from your account so nothing is left behind. The app only
        creates and cancels meetings for your own appointments; it does not read or change anything else in your account.
      </p>

      <h2>Removing the app (disconnect)</h2>
      <ul>
        <li><b>In the scheduling app:</b> go to <b>My Schedule</b>, click <b>Video</b>, and click <b>Disconnect</b> next to the provider. New appointments will no longer create links on that account.</li>
        <li><b>In Zoom directly:</b> you can also remove the app from your Zoom account. Go to the Zoom App Marketplace, then Manage, then Added Apps, and click Remove next to the app.</li>
        <li><b>In Google directly:</b> visit your Google Account security settings, open Third-party access, select the app, and remove its access.</li>
      </ul>

      <h2>Need help?</h2>
      <p>
        Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will be glad to help.
      </p>

      <div className="lgl-foot">Cayman Essential Care · Scheduling app documentation</div>
    </main>
  );
}
