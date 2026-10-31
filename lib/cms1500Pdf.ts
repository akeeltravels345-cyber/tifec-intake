// =============================================================================
// Pixel-exact CMS-1500 (08-05) PDF. Practice Perfect prints a single background
// image of the blank red form and types the data over it in Courier 10pt at
// fixed coordinates. We do the IDENTICAL thing: the same blank-form image
// (public/cms1500-0805.jpg, lifted from Practice Perfect's own output) and the
// same field coordinates, so the printed claim is a literal duplicate down to the
// line thickness. Only the DATA is ours. US Letter, 612x792 pt, top-left origin
// for the field table below (converted to PDF's bottom-left on draw).
// =============================================================================
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ClaimForm, ClaimLine } from "./cms1500";
import { caymanToday } from "./caymanTime";

const PAGE_W = 612, PAGE_H = 792;
// Where the blank-form image sits on the page (from Practice Perfect's PDF).
const IMG = { x: 14.4, y: 16.6, w: 586.5, h: 754.6 }; // y is the PDF (bottom-left) y
const BLACK = rgb(0, 0, 0);
const CH = 6; // Courier 10pt character width in points (0.6em)

const money = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sp = (v?: string) => { const m = (v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{2})$/); return m ? `${m[1]} ${m[2]} ${m[3]}` : ""; };
const dsp = (v?: string) => { const m = (v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{2})$/); return m ? `${m[1]}  ${m[2]}  ${m[3]}` : ""; };
const dxNum = (p?: string) => { if (!p) return ""; const i = "ABCDEFGHIJKL".indexOf(p.toUpperCase()); return i >= 0 ? String(i + 1) : p; };
const phone = (p?: string) => { const d = (p ?? "").replace(/\D/g, ""); return d.length >= 10 ? `${d.slice(0, 3)} ${d.slice(3)}` : (p ?? ""); };
const trunc = (s: string, maxChars: number) => (s.length > maxChars ? s.slice(0, maxChars) : s);
function todayMDY() { const m = caymanToday().match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : ""; }

export interface ClaimProvider { practiceName?: string; npi?: string; ein?: string; phone?: string; addressLine1?: string; addressLine2?: string; city?: string; region?: string; postal?: string; country?: string }

let cachedImg: Uint8Array | null = null;
function formImageBytes(): Uint8Array {
  if (!cachedImg) cachedImg = new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", "cms1500-0805.jpg")));
  return cachedImg;
}

/** One claim form drawn onto a page. Field positions are baseline (x, yTop) in
 *  points from the top-left, exactly as Practice Perfect places them. */
function drawForm(page: import("pdf-lib").PDFPage, img: import("pdf-lib").PDFImage, font: import("pdf-lib").PDFFont, f: ClaimForm, provider: ClaimProvider, legalName: string) {
  page.drawImage(img, { x: IMG.x, y: IMG.y, width: IMG.w, height: IMG.h });
  // text at (x, yTop-baseline)
  const t = (text: string | undefined, x: number, yTop: number, size = 10) => {
    if (text === undefined || text === null || text === "") return;
    page.drawText(String(text), { x, y: PAGE_H - yTop, size, font, color: BLACK });
  };

  const taxId = provider.ein || "here";
  const npi = provider.npi || "here";
  const street = [provider.addressLine1, provider.addressLine2].filter(Boolean).join(" ");
  const cityzip = [provider.city, provider.region, provider.postal].filter(Boolean).join("  ");

  // Carrier + boxes 1-13
  t(`${f.payerName}${f.carrierCode ? ` (# ${f.carrierCode})` : ""}`, 326.9, 44.9);
  t("X", 343.0, 117.5);                       // box 1: OTHER
  t(f.memberId, 381.4, 117.5);                // 1a
  t(f.patientName, 27.2, 141.8);              // 2
  t(dsp(f.dob), 241.2, 141.8);                // 3 DOB
  t("X", f.sex === "M" ? 319 : 356.1, 141.8); // 3 sex (F exact; M estimated)
  t(f.insuredName, 381.4, 141.8);             // 4
  t("X", f.relationship === "spouse" ? 292 : f.relationship === "child" ? 330 : f.relationship === "other" ? 368 : 254.9, 166.8); // 6
  t("X", 356.1, 189.5);                       // 8 patient status: Other
  t(phone(f.phone), 127.9, 215.8);            // 5 tel
  t(phone(f.phone), 483.4, 215.8);            // 7 tel
  t("X", 312.1, 261.7);                       // 10a NO
  t(dsp(f.insuredDob), 400.9, 261.7);         // 11a DOB
  t("X", f.insuredSex === "M" ? 507.8 : 557.3, 262.6); // 11a sex (M + F centered in their squares)
  t("X", 312.1, 285.6);                       // 10b NO
  t("X", 312.1, 309.6);                       // 10c NO
  t(f.carrierCode ? `# ${f.carrierCode}` : "", 241.8, 333.8); // 10d
  t("X", 427.5, 335.5);                       // 11d NO
  t("SIGNATURE ON FILE", 75.4, 380.8);        // 12
  t("SIGNATURE ON FILE", 429.5, 380.8);       // 13

  // Box 21 diagnosis (08-05: four numbered positions; position 1 is the usual one)
  const dxPos = [[40.9, 481.7], [220, 481.7], [40.9, 500], [220, 500]];
  f.diagnosis.slice(0, 4).forEach((dx, i) => t(dx, dxPos[i][0], dxPos[i][1]));

  // Box 24 service lines (up to 6), 23.9pt apart from the first
  f.lines.slice(0, 6).forEach((l: ClaimLine, i) => {
    const y = 554.5 + i * 23.9;
    const d = sp(l.date);
    t(`${d}   ${d}`, 27.2, y);
    t(l.pos, 154.8, y);
    t(l.cpt + (l.mod ? ` ${l.mod}` : ""), 200.7, y);
    t(dxNum(l.dxPointer), 341.9, y);
    t(`${money(l.charge)} ${l.units}`, 400.0, y);
  });

  // Boxes 25-30
  t(taxId, 27.2, 698.2);        // 25 Federal Tax ID
  t("X", 141.2, 697.5);         // 25 EIN
  t("X", 292.3, 698.9);         // 27 accept assignment YES
  t(`${money(f.total)}`, 415.1, 699.0, 9);   // 28 (right of the preprinted $)
  t(`${money(f.amountPaid)}`, 498.3, 699.0, 9); // 29
  t(`${money(f.balanceDue)}`, 550.7, 699.0, 9); // 30

  // Boxes 31-33
  t(phone(provider.phone), 493.6, 711.7, 9);        // 33 phone (after preprinted "(" )
  t(trunc(legalName, 31), 186.8, 722.1, 9);         // 32 facility name
  t(trunc(legalName, 35), 381.4, 722.1, 9);         // 33 billing name
  t(street, 186.8, 733.6, 9);
  t(street, 381.4, 733.6, 9);
  t(cityzip, 186.8, 745.0, 9);
  t(cityzip, 381.4, 745.0, 9);
  t(todayMDY(), 129.3, 755.6, 9);                   // 31 date
  t(npi, 191.7, 759.8, 9);                          // 32a NPI
  t(npi, 386.1, 759.8, 9);                          // 33a NPI
}

/** Build a print-ready PDF of one or more CMS-1500 (08-05) claim forms. */
export async function cms1500Pdf(forms: ClaimForm[], provider: ClaimProvider, legalName = "The Institute for Essential Care Ltd"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const img = await doc.embedJpg(formImageBytes());
  for (const f of forms) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawForm(page, img, font, f, provider, legalName);
  }
  return doc.save();
}
