// Send a web-push notification to a clinician's devices. Encryption + VAPID
// signing are handled by the `web-push` library. Dead subscriptions (the
// browser was uninstalled / permission revoked) are pruned on a 404/410.
import webpush from "web-push";
import { listPushSubs, removePushSub } from "./pushSubs";

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:admin@caymanessentialcare.com";
  if (!pub || !priv) { configured = false; return false; }
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
  return true;
}

export const pushConfigured = () => configure();

export interface PushPayload { title: string; body: string; url?: string; tag?: string }

/** Send to every device this clinician has enabled. Returns how many landed. */
export async function sendPushToClinician(clinicianId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const subs = await listPushSubs(clinicianId);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await removePushSub(s.endpoint);
    }
  }));
  return sent;
}
