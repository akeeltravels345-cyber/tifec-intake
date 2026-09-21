"use client";

import { useEffect, useRef, useState } from "react";

// A curated emoji palette. Emojis are plain unicode, so they insert straight
// into any textarea/input and store/render everywhere with no special handling.
const EMOJIS = [
  "😀", "😅", "😂", "🙂", "😉", "😊", "😍", "😎", "🤔", "😴",
  "😭", "😤", "😳", "🥳", "🙌", "👏", "👍", "👎", "🙏", "💪",
  "👀", "✅", "❌", "⚠️", "❓", "❗", "🔥", "⭐", "✨", "🎉",
  "💯", "💡", "📌", "📎", "📅", "⏰", "💰", "📈", "📉", "❤️",
];

/** A small emoji button + popover that inserts the chosen emoji at the caret of a
 *  textarea or input. The parent owns the field's value: on pick we compute the
 *  next value and hand it back through `onInsert`, then restore focus + caret. */
export default function EmojiPicker({ targetRef, onInsert, className, title = "Emoji" }: {
  targetRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onInsert: (nextValue: string) => void;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (emoji: string) => {
    const el = targetRef.current;
    if (!el) { setOpen(false); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + emoji + el.value.slice(end);
    onInsert(next);
    setOpen(false);
    // Restore focus and place the caret just after the inserted emoji, once React
    // has applied the new value.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      try { el.setSelectionRange(pos, pos); } catch { /* inputs that don't support selection */ }
    });
  };

  return (
    <div className="emj-wrap" ref={wrapRef}>
      <button type="button" className={className ?? "emj-btn"} aria-expanded={open} aria-label="Insert emoji" title={title} onClick={() => setOpen((o) => !o)}>😊</button>
      {open && (
        <div className="emj-pop" role="menu" aria-label="Emoji">
          {EMOJIS.map((e) => (
            <button key={e} type="button" className="emj-opt" title={e} onClick={() => pick(e)}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}
