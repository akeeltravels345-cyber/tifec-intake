// Prepare an image for upload from the browser: downscale big screenshots/photos
// and re-encode them so the payload is small and reliable. A full-resolution
// screenshot can be several MB, which is unreliable to send in a JSON body and to
// store/serve — shrinking it to <= 1600px and compressing keeps it well within
// limits and still perfectly readable. Non-image files are returned untouched.
//
// Browser-only (uses FileReader / Image / canvas); call from client components.

const MAX_DIM = 1600;
const SMALL_ENOUGH = 900_000; // bytes: leave already-small images as-is

export interface PreparedFile { base64: string; mime: string; name: string }

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Downscale + compress an image file; pass other files through unchanged. */
export async function prepareUpload(file: File): Promise<PreparedFile> {
  const mime = file.type || "application/octet-stream";
  const passthrough = async (): Promise<PreparedFile> => ({ base64: (await readDataUrl(file)).split(",")[1] || "", mime, name: file.name });

  // Only images can be downscaled. GIFs would lose animation, so leave them.
  if (!mime.startsWith("image/") || mime === "image/gif") return passthrough();

  try {
    const dataUrl = await readDataUrl(file);
    const img = await loadImage(dataUrl);
    const longest = Math.max(img.width, img.height);
    // Small already? Keep the original bytes (and any transparency).
    if (longest <= MAX_DIM && file.size <= SMALL_ENOUGH) return { base64: dataUrl.split(",")[1] || "", mime, name: file.name };

    const scale = Math.min(1, MAX_DIM / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return passthrough();
    // White backdrop so a transparent PNG doesn't turn black when flattened to JPEG.
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = out.split(",")[1] || "";
    if (!base64) return passthrough();
    const name = file.name.replace(/\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i, "") + ".jpg";
    return { base64, mime: "image/jpeg", name };
  } catch {
    // Anything odd (decode failure, etc.) — fall back to the raw file.
    return passthrough();
  }
}
