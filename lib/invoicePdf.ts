// =============================================================================
// Server-side invoice PDF. Turns the pure InvoiceData (from lib/invoice.ts) into
// a clean A4 PDF we can attach to an email. Pure vector text via pdf-lib, so it
// works on Vercel with no headless browser or native binary. The visual layout
// mirrors components/billing/Invoice.tsx so the emailed PDF matches the on-screen
// print view.
// =============================================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "fs";
import path from "path";
import type { InvoiceData } from "./invoice";

const money = (n: number) =>
  `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A4 in points, and margins that echo the HTML sheet (20mm sides, 22mm top/bottom).
const MM = 2.834645669;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 20 * MM;
const MARGIN_TOP = 22 * MM;
const MARGIN_BOTTOM = 20 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.102, 0.114, 0.141);
const GRAY = rgb(0.36, 0.388, 0.431);
const FAINT = rgb(0.54, 0.565, 0.61);
const HAIR = rgb(0.81, 0.83, 0.863);
const HAIR_SOFT = rgb(0.93, 0.937, 0.953);

let cachedLogo: Uint8Array | null | undefined;
function logoBytes(): Uint8Array | null {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    cachedLogo = new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", "tifec-mark.png")));
  } catch { cachedLogo = null; }
  return cachedLogo;
}

// Wrap a string to a max width, returning the lines it breaks into.
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = `${line} ${words[i]}`;
    if (font.widthOfTextAtSize(trial, size) <= maxW) line = trial;
    else { lines.push(line); line = words[i]; }
  }
  lines.push(line);
  return lines;
}

/** Render an invoice to PDF bytes. */
export async function invoicePdf(inv: InvoiceData, printedAt: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${inv.number}`);
  doc.setSubject(`Invoice for ${inv.clientName}`);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP; // cursor measured from the top, moving down

  const left = MARGIN_X;
  const right = MARGIN_X + CONTENT_W;

  const text = (
    p: PDFPage, s: string, x: number, yTop: number,
    { font = reg, size = 10, color = INK }: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => { p.drawText(s ?? "", { x, y: yTop - size, size, font, color }); };

  const rightText = (
    p: PDFPage, s: string, xRight: number, yTop: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const font = o.font ?? reg, size = o.size ?? 10;
    text(p, s, xRight - font.widthOfTextAtSize(s ?? "", size), yTop, o);
  };

  const hr = (p: PDFPage, yTop: number, color = HAIR, thickness = 1) => {
    p.drawLine({ start: { x: left, y: yTop }, end: { x: right, y: yTop }, thickness, color });
  };

  // ---- Header: practice (left) + INVOICE block (right) --------------------
  const headTop = y;
  let leftY = headTop;
  const logo = logoBytes();
  let nameX = left;
  if (logo) {
    try {
      const img = await doc.embedPng(logo);
      const h = 30, w = (img.width / img.height) * h;
      page.drawImage(img, { x: left, y: headTop - h, width: w, height: h });
      nameX = left + w + 10;
      text(page, inv.practice.name, nameX, headTop - 7, { font: bold, size: 15 });
    } catch { text(page, inv.practice.name, left, headTop, { font: bold, size: 15 }); }
    leftY = headTop - 34;
  } else {
    text(page, inv.practice.name, left, headTop, { font: bold, size: 15 });
    leftY = headTop - 22;
  }
  for (const l of inv.practice.addressLines) { text(page, l, left, leftY, { size: 8.7, color: GRAY }); leftY -= 12; }
  if (inv.practice.phone) { text(page, inv.practice.phone, left, leftY, { size: 8.7, color: GRAY }); leftY -= 12; }
  if (inv.practice.email) { text(page, inv.practice.email, left, leftY, { size: 8.7, color: GRAY }); leftY -= 12; }
  if (inv.practice.website) { text(page, inv.practice.website, left, leftY, { size: 8.7, color: GRAY }); leftY -= 12; }

  // Right: the word INVOICE (letter-spaced by hand) + the meta rows.
  rightText(page, "I N V O I C E", right, headTop, { size: 15, color: INK });
  const metaRows: [string, string][] = [["No.", inv.number], ["Issued", inv.issueDate]];
  let metaY = headTop - 26;
  for (const [k, v] of metaRows) {
    text(page, k.toUpperCase(), right - 130, metaY, { size: 7.6, color: FAINT });
    rightText(page, v, right, metaY, { size: 9, color: INK });
    metaY -= 14;
  }

  y = Math.min(leftY, metaY) - 6;
  hr(page, y, INK, 1);
  y -= 24;

  // ---- Billed to ----------------------------------------------------------
  text(page, "BILLED TO", left, y, { font: bold, size: 7.6, color: FAINT });
  y -= 14;
  text(page, inv.billTo.name, left, y, { font: bold, size: 11 });
  y -= 14;
  for (const l of inv.billTo.lines) { text(page, l, left, y, { size: 8.9, color: GRAY }); y -= 12; }
  y -= 14;

  // ---- Line-items table ---------------------------------------------------
  const cDate = left;
  const cDesc = left + 78;
  const cProv = left + 300;
  const cAmt = right; // right-aligned
  const descW = cProv - cDesc - 12;
  const provW = cAmt - cProv - 70;

  const drawTableHead = (yTop: number) => {
    text(page, "DATE OF SERVICE", cDate, yTop, { size: 7.8, color: FAINT });
    text(page, "DESCRIPTION", cDesc, yTop, { size: 7.8, color: FAINT });
    text(page, "PROVIDER", cProv, yTop, { size: 7.8, color: FAINT });
    rightText(page, "AMOUNT", cAmt, yTop, { size: 7.8, color: FAINT });
    hr(page, yTop - 8, HAIR, 1);
    return yTop - 20;
  };
  y = drawTableHead(y);

  const rowGap = 9;
  for (let i = 0; i < inv.lines.length; i++) {
    const l = inv.lines[i];
    const descLines = wrap(l.description, reg, 9.6, descW);
    const provLines = wrap(l.provider, reg, 9.6, provW);
    const rows = Math.max(descLines.length, provLines.length, 1);
    const rowH = rows * 12 + rowGap;

    // New page if this row would cross the bottom margin.
    if (y - rowH < MARGIN_BOTTOM + 90) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
      y = drawTableHead(y);
    }

    const top = y;
    text(page, l.date, cDate, top, { size: 9.6, color: GRAY });
    descLines.forEach((dl, k) => text(page, dl, cDesc, top - k * 12, { size: 9.6, color: INK }));
    provLines.forEach((pl, k) => text(page, pl, cProv, top - k * 12, { size: 9.6, color: GRAY }));
    rightText(page, money(l.portion), cAmt, top, { size: 9.6, color: INK });
    y = top - (rows * 12) - rowGap + 3;
    hr(page, y + 2, i === inv.lines.length - 1 ? HAIR : HAIR_SOFT, 1);
    y -= 9;
  }

  // ---- Totals (right-aligned block) --------------------------------------
  y -= 6;
  const totLabelX = right - 150;
  text(page, "Subtotal", totLabelX, y, { size: 9.6, color: GRAY });
  rightText(page, money(inv.subtotal), right, y, { size: 9.6, color: GRAY });
  y -= 18;
  hr(page, y, INK, 1);
  y -= 18;
  text(page, "Amount due", totLabelX, y, { font: bold, size: 11.5, color: INK });
  rightText(page, money(inv.amountDue), right, y, { font: bold, size: 11.5, color: INK });
  y -= 30;

  // ---- Notes --------------------------------------------------------------
  if (inv.managingProvider) { text(page, `Managing provider: ${inv.managingProvider}`, left, y, { font: bold, size: 8.9, color: INK }); y -= 14; }
  const note = `Please settle this invoice before your next visit. If you need support, speak with your clinician about a payment plan. Thank you for trusting us with your care.`;
  for (const nl of wrap(note, reg, 8.9, CONTENT_W)) { text(page, nl, left, y, { size: 8.9, color: GRAY }); y -= 12; }

  // ---- Footer (bottom of the last page) -----------------------------------
  text(page, `Invoice ${inv.number}  ·  ${inv.clientName}  ·  generated ${printedAt}`, left, MARGIN_BOTTOM + 4, { size: 7.8, color: FAINT });

  return doc.save();
}
