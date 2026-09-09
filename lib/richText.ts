// Tiny, safe rich-text for ticket bodies and comments. Users write with simple
// markers (Discord-style) that the compose toolbar inserts; we render a small,
// fixed set of tags. HTML is escaped FIRST, so nothing a user types can inject
// markup — only our own <strong>/<em>/<u>/<s>/<a> tags are produced.
//
//   **bold**   __underline__   *italic*   ~~strike~~
//
// Plain URLs (https://…, http://…, or www.…) become clickable links. They're
// pulled out BEFORE the markers run, so a link that contains ** or __ is never
// mangled, and the marker passes never touch the text inside an <a> tag.

export const RICH_MARKERS = {
  bold: "**",
  italic: "*",
  underline: "__",
  strike: "~~",
} as const;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Apply the inline markers to an already-escaped fragment.
const applyMarkers = (s: string) =>
  s
    // Order matters: the two-char markers (**, __, ~~) before the one-char (*).
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");

// Matches a run that looks like a URL, on the RAW (un-escaped) text.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<]+/gi;
// Trailing punctuation that is almost always sentence punctuation, not URL.
const TRAILING = /[.,!?)"']+$/;

/** Convert marked-up text to safe HTML for rendering with dangerouslySetInnerHTML. */
export function formatText(raw: string): string {
  const text = raw || "";
  let out = "";
  let last = 0;

  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];

    // Don't swallow trailing sentence punctuation; if a ) has no matching (,
    // treat it as punctuation too.
    let trail = "";
    const punct = url.match(TRAILING);
    if (punct) { trail = punct[0]; url = url.slice(0, -trail.length); }
    if (url.endsWith(")") && !url.includes("(")) { trail = ")" + trail; url = url.slice(0, -1); }

    // Text before the link: escaped, then markers applied.
    out += applyMarkers(escapeHtml(text.slice(last, start)));

    const href = url.startsWith("www.") ? `https://${url}` : url;
    const safeHref = escapeHtml(href);
    const label = escapeHtml(url);
    out += `<a href="${safeHref}" class="rt-link" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
    out += escapeHtml(trail);
    last = start + m[0].length;
  }

  out += applyMarkers(escapeHtml(text.slice(last)));
  return out.replace(/\n/g, "<br>");
}
