// Auto-generated video meeting links for virtual appointments.
//
// Two providers, both server-to-server (no per-clinician interactive OAuth):
//   Zoom        - Server-to-Server OAuth app (account-level)
//   Google Meet - a Google Workspace service account with domain-wide
//                 delegation, creating a Calendar event that carries a Meet link
//
// Secrets come from env vars ONLY (never the database). Which provider is used,
// and which host each clinician maps to, comes from scheduling Settings.
//
// Required env (Zoom):
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
// Required env (Google Meet):
//   GOOGLE_SA_EMAIL         service-account email
//   GOOGLE_SA_PRIVATE_KEY   the service account's private key (PEM; \n escaped is fine)
//
// Every call is best-effort: any failure returns null and the caller falls back
// to a manually entered link, so a booking is NEVER blocked by video setup.

import crypto from "crypto";
import type { VideoProvider } from "./scheduling";

export interface VideoLink { url: string; provider: VideoProvider; host: string }
interface MeetingArgs { host: string; topic: string; startAtISO: string; durationMin: number }

// ---- capability checks (does the env have credentials?) --------------------
export function zoomConfigured(): boolean {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}
export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}
export function providerConfigured(p: VideoProvider): boolean {
  return p === "zoom" ? zoomConfigured() : p === "google_meet" ? googleConfigured() : false;
}

// =============================================================================
// Zoom - Server-to-Server OAuth
// =============================================================================
let zoomTok: { token: string; exp: number } | null = null;
async function zoomToken(): Promise<string> {
  if (zoomTok && zoomTok.exp > Date.now() + 60_000) return zoomTok.token;
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID as string)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error(`Zoom token ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  zoomTok = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return zoomTok.token;
}
async function createZoomMeeting({ host, topic, startAtISO, durationMin }: MeetingArgs): Promise<string> {
  const token = await zoomToken();
  const who = encodeURIComponent(host || "me");
  const res = await fetch(`https://api.zoom.us/v2/users/${who}/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: topic.slice(0, 200), type: 2, // scheduled
      start_time: startAtISO, duration: Math.max(1, Math.round(durationMin)), timezone: "UTC",
      settings: { join_before_host: true, waiting_room: true, approval_type: 2 },
    }),
  });
  if (!res.ok) throw new Error(`Zoom meeting ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { join_url: string };
  if (!j.join_url) throw new Error("Zoom returned no join_url");
  return j.join_url;
}

// =============================================================================
// Google Meet - service account (domain-wide delegation) -> Calendar event
// =============================================================================
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const googleTok = new Map<string, { token: string; exp: number }>(); // per impersonated host
async function googleToken(subject: string): Promise<string> {
  const cached = googleTok.get(subject);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = (process.env.GOOGLE_SA_PRIVATE_KEY as string).replace(/\\n/g, "\n");
  const iat = Math.floor(Date.now() / 1000);
  const claim = {
    iss: process.env.GOOGLE_SA_EMAIL, sub: subject,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
  };
  const signingInput = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claim))}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), key);
  const jwt = `${signingInput}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  googleTok.set(subject, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}
async function createMeetLink({ host, topic, startAtISO, durationMin }: MeetingArgs): Promise<string> {
  const token = await googleToken(host);
  const end = new Date(Date.parse(startAtISO) + Math.max(1, durationMin) * 60_000).toISOString();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(host)}/events?conferenceDataVersion=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: topic.slice(0, 200),
      start: { dateTime: startAtISO, timeZone: "UTC" },
      end: { dateTime: end, timeZone: "UTC" },
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  if (!res.ok) throw new Error(`Google event ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };
  const link = j.hangoutLink || j.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
  if (!link) throw new Error("Google returned no Meet link");
  return link;
}

// =============================================================================
// Public entry point
// =============================================================================
export interface VideoConfig { provider: VideoProvider; defaultHost: string; hostMap: Record<string, string> }

/** Create a meeting link for a virtual appointment, or null if not configured /
 *  it failed (caller keeps whatever link was entered manually). */
export async function createVideoLink(
  cfg: VideoConfig,
  args: { clinicianId: string; topic: string; startAtISO: string; durationMin: number },
): Promise<VideoLink | null> {
  const provider = cfg.provider;
  if (provider === "none" || !providerConfigured(provider)) return null;
  const host = cfg.hostMap[args.clinicianId] || cfg.defaultHost || "me";
  try {
    const url = provider === "zoom"
      ? await createZoomMeeting({ host, topic: args.topic, startAtISO: args.startAtISO, durationMin: args.durationMin })
      : await createMeetLink({ host, topic: args.topic, startAtISO: args.startAtISO, durationMin: args.durationMin });
    return { url, provider, host };
  } catch (e) {
    console.error(`createVideoLink (${provider}) failed`, e);
    return null;
  }
}

/** Lightweight credential/connection test used by the Settings "Test" button. */
export async function testVideoProvider(provider: VideoProvider, host: string): Promise<{ ok: boolean; detail: string }> {
  try {
    if (provider === "zoom") {
      if (!zoomConfigured()) return { ok: false, detail: "Missing ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET." };
      await zoomToken();
      return { ok: true, detail: "Zoom credentials accepted." };
    }
    if (provider === "google_meet") {
      if (!googleConfigured()) return { ok: false, detail: "Missing GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY." };
      if (!host) return { ok: false, detail: "Set a default host email (a Workspace user to impersonate)." };
      await googleToken(host);
      return { ok: true, detail: `Google service account can act as ${host}.` };
    }
    return { ok: false, detail: "No provider selected." };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Connection failed." };
  }
}
