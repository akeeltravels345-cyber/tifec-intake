// Short chimes synthesised with the Web Audio API rather than shipped as audio
// files — no binary assets, no extra requests, nothing for a CSP to block.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    // Browsers start the context suspended until the page has been interacted
    // with; resuming is a no-op once it's running.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft sine note. Short attack + long-ish decay so it reads as a chime
 *  rather than a beep. */
function note(c: AudioContext, freq: number, startAt: number, dur: number, peak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t = c.currentTime + startAt;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const SOUND_KEY = "tifec-team-sound";

/** Muted unless explicitly turned on? No — on by default, but the choice sticks
 *  per browser, because a chime mid-session is worse than a missed message. */
export function soundOn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_KEY) !== "off";
}

export function setSoundOn(on: boolean) {
  try { window.localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* private mode */ }
}

/** A quiet single note for a message; a brighter rising pair for an
 *  announcement, so the two are tellable apart without looking. */
export function chime(kind: "message" | "notice") {
  if (!soundOn()) return;
  const c = audio();
  if (!c) return;
  try {
    if (kind === "message") {
      note(c, 660, 0, 0.28, 0.05);
    } else {
      note(c, 523.25, 0, 0.3, 0.06);
      note(c, 783.99, 0.13, 0.42, 0.055);
    }
  } catch { /* audio is a nicety, never a failure */ }
}
