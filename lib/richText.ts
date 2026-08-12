// Tiny, safe rich-text for ticket bodies and comments. Users write with simple
// markers (Discord-style) that the compose toolbar inserts; we render a small,
// fixed set of tags. HTML is escaped FIRST, so nothing a user types can inject
// markup — only our own <strong>/<em>/<u>/<s> tags are produced.
//
//   **bold**   __underline__   *italic*   ~~strike~~

export const RICH_MARKERS = {
  bold: "**",
  italic: "*",
  underline: "__",
  strike: "~~",
} as const;

/** Convert marked-up text to safe HTML for rendering with dangerouslySetInnerHTML. */
export function formatText(raw: string): string {
  const esc = (raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    // Order matters: the two-char markers (**, __, ~~) before the one-char (*).
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}
