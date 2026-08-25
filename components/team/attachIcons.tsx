import type { ReactNode } from "react";

// Line icons shared by the chat and ticket composers (attach photo / file /
// voice, plus stop + send). Inherit color + size from the button.
const svg = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export const IcoImage = svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-4.5-4.5L6 21" /></>);
export const IcoFile = svg(<path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.48" />);
export const IcoMic = svg(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>);
export const IcoStop = svg(<rect x="6" y="6" width="12" height="12" rx="2.5" />);
export const IcoSend = svg(<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />);
