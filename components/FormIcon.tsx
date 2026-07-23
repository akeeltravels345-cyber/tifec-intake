import type { ReactNode } from "react";

// Clean single-stroke line icons (Lucide/Feather style) for the form cards,
// replacing the earlier emoji. Each form key maps to a symbol; several measures
// of the same domain can share one (e.g. both depression measures use the cloud).

const SYMBOLS: Record<string, ReactNode> = {
  // people / intake
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  // screening clipboard with a small ECG line
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M8 14h2l1.2-2.5L13 16l1.2-2h1.8" />
    </>
  ),
  // child (small stick figure)
  child: (
    <>
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M12 8v6" />
      <path d="M8.5 11h7" />
      <path d="m9 20 3-5 3 5" />
    </>
  ),
  // mood / domains
  rain: (
    <>
      <path d="M17.5 16a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 16" />
      <path d="M8 18v2" />
      <path d="M12 18v3" />
      <path d="M16 18v2" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />,
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />,
  stethoscope: (
    <>
      <path d="M4 3v6a5 5 0 0 0 10 0V3" />
      <path d="M4 3H2.5M14 3h1.5" />
      <path d="M9 14v2a5 5 0 0 0 5 5 5 5 0 0 0 5-5v-2" />
      <circle cx="19" cy="11" r="2" />
    </>
  ),
  loop: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  pill: (
    <>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  brain: (
    <>
      <path d="M12 5a3 3 0 0 0-5.4-1.8A2.5 2.5 0 0 0 4 6.5a2.5 2.5 0 0 0-.5 4.5A2.5 2.5 0 0 0 5 15a2.5 2.5 0 0 0 4.5 1.5A2.5 2.5 0 0 0 12 19z" />
      <path d="M12 5a3 3 0 0 1 5.4-1.8A2.5 2.5 0 0 1 20 6.5a2.5 2.5 0 0 1 .5 4.5A2.5 2.5 0 0 1 19 15a2.5 2.5 0 0 1-4.5 1.5A2.5 2.5 0 0 1 12 19z" />
      <path d="M12 5v14" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  home: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  alert: (
    <>
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  storm: (
    <>
      <path d="M6 16.3A4 4 0 1 1 6.7 8.5a6 6 0 1 1 11.7 1.5" />
      <path d="m13 12-3 5h4l-3 5" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8" />
    </>
  ),
  doc: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
};

const KEY_TO_SYMBOL: Record<string, string> = {
  individual: "user",
  couples: "users",
  "dsm5-level1-adult": "clipboard",
  "dsm5-level1-child": "child",
  "dsm5-level1-child-self": "child",
  "psychoed-intake": "clipboard",
  "child-behaviour-self": "child",
  "parent-behaviour-assessment": "users",
  "ei-camp-agreement": "compass",
  "l2-depression": "rain",
  "l2-anxiety": "pulse",
  "l2-anger": "flame",
  "l2-mania": "zap",
  "l2-sleep": "moon",
  "l2-somatic": "stethoscope",
  "l2-repetitive": "loop",
  "l2-substance": "pill",
  "sev-depression": "rain",
  "sev-gad": "brain",
  "sev-social-anxiety": "chat",
  "sev-separation-anxiety": "home",
  "sev-acute-stress": "alert",
  "sev-ptsd": "storm",
  "l2p-depression": "rain",
  "l2p-anxiety": "pulse",
  "l2p-anger": "flame",
  "l2p-irritability": "zap",
  "l2p-mania": "zap",
  "l2p-inattention": "brain",
  "l2p-sleep": "moon",
  "l2p-somatic": "stethoscope",
  "l2p-substance": "pill",
  "l2c-depression": "rain",
  "l2c-anxiety": "pulse",
  "l2c-anger": "flame",
  "l2c-irritability": "zap",
  "l2c-mania": "zap",
  "l2c-sleep": "moon",
  "l2c-somatic": "stethoscope",
  "l2c-repetitive": "loop",
  "l2c-substance": "pill",
};

export default function FormIcon({ formKey, symbol, size = 22 }: { formKey?: string; symbol?: string; size?: number }) {
  const sym = symbol ?? (formKey ? KEY_TO_SYMBOL[formKey] : undefined) ?? "doc";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SYMBOLS[sym] ?? SYMBOLS.doc}
    </svg>
  );
}
