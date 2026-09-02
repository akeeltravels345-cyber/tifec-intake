"use client";

import { useRef, useState } from "react";

// Resize any picked image to a centered square JPEG data URL (default 160px) so
// the stored photo stays tiny — no giant uploads, quick to load everywhere.
function toSquareJpeg(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

export default function AvatarUpload({ initial, initials }: { initial: string | null; initials: string }) {
  const [avatar, setAvatar] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(next: string | null) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/account/avatar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar: next }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not save."); return; }
      setAvatar(data.avatar ?? null);
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Pick an image file."); return; }
    setErr("");
    try {
      const dataUrl = await toSquareJpeg(file);
      await save(dataUrl);
    } catch { setErr("Couldn't read that image — try another."); }
  }

  return (
    <div className="av-set">
      <h2 className="av-h">Profile photo</h2>
      <p className="av-sub">A square photo works best. It shows on your account and in the sidebar.</p>
      <div className="av-row">
        <div className="av-pic">
          {avatar ? <img src={avatar} alt="Your profile photo" /> : <span className="av-init">{initials}</span>}
        </div>
        <div className="av-acts">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <button type="button" className="av-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Saving…" : avatar ? "Change photo" : "Upload a photo"}
          </button>
          {avatar && <button type="button" className="av-btn ghost" disabled={busy} onClick={() => save(null)}>Remove</button>}
        </div>
      </div>
      {err && <p className="av-err">{err}</p>}
    </div>
  );
}
