// =============================================================================
// Server-side CMS-1500 (02/12) claim PDF. Draws the official OMB-0938-1197 claim
// form with pure pdf-lib vector text — the same form the app renders on screen
// (components/billing/Cms1500OfficialForm.tsx), so the emailed/stored copy is the
// exact claim the biller sees. Serverless-safe (no headless browser), matching
// lib/invoicePdf.ts's approach. One PDF page per ClaimForm; buildClaimForms may
// return several (one per payer, and a continuation page every 6 service lines),
// so claimPdf() renders them all into a single multi-page document.
// =============================================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ClaimForm } from "./cms1500";

export interface ClaimProvider {
  practiceName?: string; npi?: string; ein?: string; phone?: string;
  addressLine1?: string; addressLine2?: string; city?: string; region?: string; postal?: string; country?: string;
}

const money = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// US Letter in points; the form prints at 0.25in margins like the on-screen @page.
const PAGE_W = 612;
const PAGE_H = 792;
const M = 18;                 // 0.25in margin
const L = M;                  // left content edge
const R = PAGE_W - M;         // right content edge
const CW = R - L;             // content width

// The form's red and the dark-ink used for typed values (matches the CSS vars
// --fr #c9322d and --fd #0d1b2a).
const RED = rgb(0.788, 0.196, 0.176);
const INK = rgb(0.051, 0.106, 0.165);
const HAIR = rgb(0.905, 0.812, 0.792); // faint intra-cell rules (#e7cdc8-ish)
const HEADBG = rgb(0.965, 0.843, 0.816); // service-line header fill (#f6d7d0)

// Row heights (top-to-bottom), tuned so the whole form fits inside the margins.
const H_HEAD = 26;
const H_R1 = 30;      // 1 / 1a
const H_R234 = 30;    // 2 / 3 / 4
const H_ADDR = 48;    // 5 / 6-8 / 7 (three sub-rows)
const H_STACK = 78;   // 9 / 10 / 11 (five stacked rows)
const H_SIG = 24;     // 12 / 13
const H_R141516 = 26; // 14 / 15 / 16
const H_R1718 = 28;   // 17 / 18
const H_R1920 = 26;   // 19 / 20
const H_DX = 46;      // 21 / 22-23
const H_SVCHEAD = 16;
const H_SVCROW = 21;
const H_R2530 = 30;   // 25..30
const H_R3133 = 46;   // 31 / 32 / 33

export async function claimPdf(forms: ClaimForm[], provider: ClaimProvider): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`CMS-1500 claim${forms[0] ? ` — ${forms[0].payerName}` : ""}`);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);

  for (const f of forms) drawForm(doc, reg, bold, ital, f, provider);
  return doc.save();
}

function drawForm(doc: PDFDocument, reg: PDFFont, bold: PDFFont, ital: PDFFont, f: ClaimForm, provider: ClaimProvider) {
  const page = doc.addPage([PAGE_W, PAGE_H]);

  // ---- primitive helpers (y measured from the TOP, converted on draw) -------
  const Y = (yTop: number) => PAGE_H - yTop;
  const line = (x0: number, yTop0: number, x1: number, yTop1: number, color = RED, thickness = 0.8) =>
    page.drawLine({ start: { x: x0, y: Y(yTop0) }, end: { x: x1, y: Y(yTop1) }, thickness, color });
  const hline = (x0: number, x1: number, yTop: number, color = RED, thickness = 0.8) => line(x0, yTop, x1, yTop, color, thickness);
  const vline = (x: number, yTop0: number, yTop1: number, color = RED, thickness = 0.8) => line(x, yTop0, x, yTop1, color, thickness);
  const box = (x: number, yTop: number, w: number, h: number, color = RED, thickness = 0.8) => {
    hline(x, x + w, yTop, color, thickness); hline(x, x + w, yTop + h, color, thickness);
    vline(x, yTop, yTop + h, color, thickness); vline(x + w, yTop, yTop + h, color, thickness);
  };
  // top-anchored text (yTop is the top of the glyph box)
  const txt = (s: string, x: number, yTop: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const font = o.font ?? reg, size = o.size ?? 6.2;
    page.drawText(s ?? "", { x, y: Y(yTop) - size, size, font, color: o.color ?? RED });
  };
  const rtxt = (s: string, xRight: number, yTop: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const font = o.font ?? reg, size = o.size ?? 6.2;
    txt(s, xRight - font.widthOfTextAtSize(s ?? "", size), yTop, o);
  };
  // A cell's small red number label (e.g. "1a.") tucked top-left.
  const num = (s: string, x: number, yTop: number) => txt(s, x + 1.5, yTop + 2.5, { font: bold, size: 6 });
  // A cell's red caption text.
  const cap = (s: string, x: number, yTop: number, size = 5.6) => txt(s, x, yTop + 2.5, { size });
  // A typed dark-ink value.
  const val = (s: string, x: number, yTop: number, size = 8.5) => { if (s) txt(s, x, yTop, { font: reg, size, color: INK }); };
  // Checkbox with optional X.
  const cbox = (x: number, yTop: number, on?: boolean) => {
    box(x, yTop, 7, 7, RED, 0.8);
    if (on) txt("X", x + 1.4, yTop - 0.3, { font: bold, size: 7, color: INK });
  };
  // MM DD YY comb into three underlined cells starting at x.
  const dateComb = (v: string | undefined, x: number, yTop: number) => {
    const m = (v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    const parts = m ? [m[1], m[2], m[3]] : ["", "", ""];
    let cx = x;
    for (const p of parts) { if (p) txt(p, cx + 2, yTop, { font: reg, size: 8, color: INK }); cx += 16; }
  };

  let y = M; // running top cursor

  // ===== Header =============================================================
  txt("HEALTH INSURANCE CLAIM FORM", L + 130, y + 2, { font: bold, size: 12 });
  txt("APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12", L + 130, y + 17, { size: 6 });
  txt("PICA", L, y + 3, { font: bold, size: 8 });
  rtxt("PICA", R, y + 3, { font: bold, size: 8 });
  y += H_HEAD;

  // Outer frame top edge starts here.
  const frameTop = y;

  // ===== Row 1: program boxes | 1a INSURED'S ID =============================
  const c1 = L + (CW * 2) / 3; // split 2:1
  rowFrame(y, H_R1, [L, c1, R]);
  num("1.", L, y);
  const progs: [string, boolean][] = [
    ["MEDICARE", false], ["MEDICAID", false], ["TRICARE", false], ["CHAMPVA", false],
    ["GROUP HEALTH PLAN", true], ["FECA BLK LUNG", false], ["OTHER", false],
  ];
  let px = L + 14;
  for (const [lbl, on] of progs) {
    cap(lbl, px, y + 1, 5);
    cbox(px + reg.widthOfTextAtSize(lbl, 5) + 3, y + 1.5, on);
    px += reg.widthOfTextAtSize(lbl, 5) + 20;
  }
  num("1a.", c1, y);
  cap("INSURED'S I.D. NUMBER", c1 + 16, y);
  val(f.memberId ?? "", c1 + 16, y + 9);
  y += H_R1;

  // ===== Row 2/3/4 ==========================================================
  const a = L + CW / 2, b = L + (CW * 3) / 4; // 2:1:1 → 0, 1/2, 3/4
  rowFrame(y, H_R234, [L, a, b, R]);
  num("2.", L, y); cap("PATIENT'S NAME (Last, First, MI)", L + 14, y); val(f.patientName, L + 14, y + 9);
  num("3.", a, y); cap("PATIENT'S BIRTH DATE", a + 14, y); cap("SEX", b - 30, y);
  dateComb(f.dob, a + 14, y + 9);
  cap("M", b - 30, y + 10); cbox(b - 24, y + 10.5, f.sex === "M"); cap("F", b - 14, y + 10); cbox(b - 8, y + 10.5, f.sex === "F");
  num("4.", b, y); cap("INSURED'S NAME (Last, First, MI)", b + 14, y); val(f.insuredName, b + 14, y + 9);
  y += H_R234;

  // ===== Address block: 5 (2) | 6-8 (1) | 7 (1) ============================
  rowFrame(y, H_ADDR, [L, a, b, R]);
  addrCell("5.", "PATIENT'S ADDRESS (No., Street)", f.patientAddr, f.phone, L, y, a);
  // middle 6 + 8
  num("6.", a, y); cap("PATIENT RELATIONSHIP TO INSURED", a + 14, y);
  const rels: [string, string][] = [["Self", "self"], ["Spouse", "spouse"], ["Child", "child"], ["Other", "other"]];
  let rx = a + 6;
  for (const [lbl, key] of rels) { cap(lbl, rx, y + 10); const w = reg.widthOfTextAtSize(lbl, 5.6); cbox(rx + w + 2, y + 10.5, f.relationship === key); rx += w + 16; }
  hline(a, b, y + H_ADDR / 2, HAIR, 0.6);
  num("8.", a, y + H_ADDR / 2); cap("RESERVED FOR NUCC USE", a + 14, y + H_ADDR / 2);
  addrCell("7.", "INSURED'S ADDRESS (No., Street)", f.insuredAddr, undefined, b, y, R);
  y += H_ADDR;

  // ===== 9 / 10 / 11 stacks =================================================
  rowFrame(y, H_STACK, [L, a, b, R]);
  const sh = H_STACK / 5;
  // Col 9 (other insured)
  const nine = ["9.  OTHER INSURED'S NAME (Last, First, MI)", "a.  OTHER INSURED'S POLICY OR GROUP NUMBER", "b.  RESERVED FOR NUCC USE", "c.  RESERVED FOR NUCC USE", "d.  INSURANCE PLAN NAME OR PROGRAM NAME"];
  nine.forEach((s, i) => { if (i) hline(L, a, y + sh * i, HAIR, 0.6); cap(s, L + 2, y + sh * i); });
  // Col 10 (condition)
  cap("10.  IS PATIENT'S CONDITION RELATED TO:", a + 2, y, 5.6);
  const conds = ["a. EMPLOYMENT? (Current or Previous)", "b. AUTO ACCIDENT?", "c. OTHER ACCIDENT?"];
  conds.forEach((s, i) => {
    const yy = y + sh * (i + 1); hline(a, b, yy, HAIR, 0.6);
    cap(s, a + 4, yy);
    cap("YES", b - 44, yy + 4); cbox(b - 32, yy + 4.5, false); cap("NO", b - 22, yy + 4); cbox(b - 12, yy + 4.5, true);
  });
  hline(a, b, y + sh * 4, HAIR, 0.6);
  num("10d.", a, y + sh * 4); cap("CLAIM CODES", a + 20, y + sh * 4); val(f.carrierCode ?? "", a + 20, y + sh * 4 + 8, 8);
  // Col 11 (insured policy)
  num("11.", b, y); cap("INSURED'S POLICY GROUP OR FECA NUMBER", b + 16, y); val(f.groupNo ?? "", b + 16, y + 8, 8);
  hline(b, R, y + sh, HAIR, 0.6); cap("a. INSURED'S DATE OF BIRTH", b + 2, y + sh); dateComb(f.insuredDob, b + 2, y + sh + 7);
  cap("M", R - 52, y + sh + 7); cbox(R - 46, y + sh + 7.5, f.insuredSex === "M"); cap("F", R - 34, y + sh + 7); cbox(R - 28, y + sh + 7.5, f.insuredSex === "F");
  hline(b, R, y + sh * 2, HAIR, 0.6); cap("b. OTHER CLAIM ID (Designated by NUCC)", b + 2, y + sh * 2);
  hline(b, R, y + sh * 3, HAIR, 0.6); cap("c. INSURANCE PLAN NAME OR PROGRAM NAME", b + 2, y + sh * 3); val(f.planName ?? "", b + 2, y + sh * 3 + 8, 8);
  hline(b, R, y + sh * 4, HAIR, 0.6); cap("d. IS THERE ANOTHER HEALTH BENEFIT PLAN?", b + 2, y + sh * 4);
  cap("YES", R - 44, y + sh * 4 + 4); cbox(R - 32, y + sh * 4 + 4.5, false); cap("NO", R - 22, y + sh * 4 + 4); cbox(R - 12, y + sh * 4 + 4.5, true);
  y += H_STACK;

  // ===== 12 / 13 signatures =================================================
  rowFrame(y, H_SIG, [L, a, R]);
  num("12.", L, y); cap("PATIENT'S OR AUTHORIZED PERSON'S SIGNATURE", L + 16, y);
  txt("SIGNATURE ON FILE", L + 16, y + 10, { font: ital, size: 8, color: INK }); rtxt("DATE", a - 4, y + 10, { size: 5.6 });
  num("13.", a, y); cap("INSURED'S OR AUTHORIZED PERSON'S SIGNATURE", a + 16, y);
  txt("SIGNATURE ON FILE", a + 16, y + 10, { font: ital, size: 8, color: INK });
  y += H_SIG;

  // ===== 14 / 15 / 16 =======================================================
  rowFrame(y, H_R141516, [L, L + CW / 3, L + (CW * 2) / 3, R]);
  num("14.", L, y); cap("DATE OF CURRENT ILLNESS/INJURY/PREGNANCY", L + 16, y);
  num("15.", L + CW / 3, y); cap("OTHER DATE", L + CW / 3 + 16, y);
  num("16.", L + (CW * 2) / 3, y); cap("DATES PATIENT UNABLE TO WORK", L + (CW * 2) / 3 + 16, y);
  y += H_R141516;

  // ===== 17 / 18 ============================================================
  rowFrame(y, H_R1718, [L, a, R]);
  num("17.", L, y); cap("NAME OF REFERRING PROVIDER OR OTHER SOURCE", L + 16, y);
  cap("17a.", L + 4, y + H_R1718 - 8); cap("17b.  NPI", a - 60, y + H_R1718 - 8);
  num("18.", a, y); cap("HOSPITALIZATION DATES RELATED TO CURRENT SERVICES", a + 16, y);
  y += H_R1718;

  // ===== 19 / 20 ============================================================
  rowFrame(y, H_R1920, [L, a, R]);
  num("19.", L, y); cap("ADDITIONAL CLAIM INFORMATION (Designated by NUCC)", L + 16, y);
  num("20.", a, y); cap("OUTSIDE LAB?", a + 16, y);
  cap("YES", a + 70, y + 2); cbox(a + 82, y + 2.5, false); cap("NO", a + 92, y + 2); cbox(a + 102, y + 2.5, true);
  rtxt("$ CHARGES", R - 4, y + 2, { size: 5.6 });
  y += H_R1920;

  // ===== 21 diagnosis | 22 / 23 =============================================
  rowFrame(y, H_DX, [L, a, R]);
  num("21.", L, y); cap("DIAGNOSIS OR NATURE OF ILLNESS OR INJURY (Relate A-L to 24E)", L + 16, y);
  rtxt("ICD Ind.  0", a - 4, y, { size: 5.6 });
  const dxLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const dxColW = (a - L - 8) / 4;
  dxLetters.forEach((Lt, i) => {
    const col = i % 4, rowi = Math.floor(i / 4);
    const dx = L + 4 + col * dxColW, dy = y + 12 + rowi * 11;
    txt(`${Lt}.`, dx, dy, { font: bold, size: 6.5 });
    val(f.diagnosis[i] ?? "", dx + 10, dy - 0.5, 8);
    hline(dx, dx + dxColW - 4, dy + 9, HAIR, 0.5);
  });
  num("22.", a, y); cap("RESUBMISSION CODE / ORIGINAL REF. NO.", a + 16, y);
  hline(a, R, y + H_DX / 2, HAIR, 0.6);
  num("23.", a, y + H_DX / 2); cap("PRIOR AUTHORIZATION NUMBER", a + 16, y + H_DX / 2);
  y += H_DX;

  // ===== 24 service lines ===================================================
  // Column flexes from the on-screen form: a2.6 b.5 c.4 d1.7 e.5 f1 g.5 h.5 i.5 j1.6
  const flex = [2.6, 0.5, 0.4, 1.7, 0.5, 1, 0.5, 0.5, 0.5, 1.6];
  const ftot = flex.reduce((s, n) => s + n, 0);
  const colX: number[] = [L];
  flex.forEach((fl) => colX.push(colX[colX.length - 1] + (fl / ftot) * CW));
  // header band
  page.drawRectangle({ x: L, y: Y(y + H_SVCHEAD), width: CW, height: H_SVCHEAD, color: HEADBG });
  box(L, y, CW, H_SVCHEAD);
  const heads = [
    ["24. A. DATE(S) OF SERVICE", "From — To"], ["B.", "POS"], ["C.", "EMG"], ["D. PROCEDURES/SERVICES", "CPT · MOD"],
    ["E.", "DX"], ["F.", "$ CHARGES"], ["G.", "UNITS"], ["H.", "EPSDT"], ["I.", "ID QUAL"], ["J. RENDERING", "PROVIDER ID #"],
  ];
  heads.forEach((h, i) => { txt(h[0], colX[i] + 1.5, y + 1.5, { font: bold, size: 5 }); txt(h[1], colX[i] + 1.5, y + 8.5, { size: 4.6 }); if (i) vline(colX[i], y, y + H_SVCHEAD); });
  y += H_SVCHEAD;

  const lines = [...f.lines];
  while (lines.length < 6) lines.push(null as unknown as (typeof f.lines)[number]);
  lines.forEach((l, i) => {
    const ry = y + i * H_SVCROW;
    if (i % 2 === 1) page.drawRectangle({ x: L, y: Y(ry + H_SVCROW), width: CW, height: H_SVCROW, color: rgb(0.988, 0.953, 0.945) });
    if (i) hline(L, R, ry, rgb(0.941, 0.871, 0.859), 0.5);
    for (let c = 1; c < colX.length - 1; c++) vline(colX[c], ry, ry + H_SVCROW, rgb(0.905, 0.718, 0.686), 0.5);
    if (!l) return;
    const vy = ry + 6;
    dateComb(l.date, colX[0] + 1, vy - 1); // from
    dateComb(l.date, colX[0] + 46, vy - 1); // to
    txt(l.pos ?? "", colX[1] + 2, vy, { size: 8, color: INK });
    txt(l.cpt ?? "", colX[3] + 2, vy, { font: bold, size: 8, color: INK });
    if (l.mod) txt(l.mod, colX[3] + 34, vy, { size: 7, color: rgb(0.478, 0.353, 0.329) });
    txt(l.dxPointer ?? "", colX[4] + 2, vy, { size: 8, color: INK });
    rtxt(money(l.charge), colX[6] - 3, vy, { size: 8, color: INK });
    txt(String(l.units ?? ""), colX[7] - 8, vy, { size: 8, color: INK });
    txt("NPI", colX[8] + 1, vy + 1, { size: 5, color: RED });
    if (l.renderingNpi) txt(l.renderingNpi, colX[9] + 2, vy, { size: 7.5, color: INK });
    else txt(l.renderingName ?? "", colX[9] + 2, vy, { font: ital, size: 6.5, color: rgb(0.604, 0.416, 0.353) });
  });
  y += H_SVCROW * 6;
  box(L, y - H_SVCROW * 6, CW, H_SVCROW * 6); // outline of the 6 rows

  // ===== 25..30 =============================================================
  const g6 = [L, L + CW * 0.19, L + CW * 0.38, L + CW * 0.53, L + CW * 0.68, L + CW * 0.84, R];
  rowFrame(y, H_R2530, g6);
  num("25.", g6[0], y); cap("FEDERAL TAX I.D. NO.", g6[0] + 16, y);
  cap("SSN", g6[1] - 34, y + 1); cbox(g6[1] - 22, y + 1.5, false); cap("EIN", g6[1] - 14, y + 1); cbox(g6[1] - 6, y + 1.5, !!provider.ein);
  val(provider.ein ?? "", g6[0] + 16, y + 10, 8);
  num("26.", g6[1], y); cap("PATIENT'S ACCOUNT NO.", g6[1] + 16, y);
  num("27.", g6[2], y); cap("ACCEPT ASSIGNMENT?", g6[2] + 16, y);
  cap("YES", g6[2] + 4, y + 12); cbox(g6[2] + 20, y + 12.5, true); cap("NO", g6[2] + 34, y + 12); cbox(g6[2] + 46, y + 12.5, false);
  num("28.", g6[3], y); cap("TOTAL CHARGE", g6[3] + 16, y); val(`$ ${money(f.total)}`, g6[3] + 8, y + 12, 8.5);
  num("29.", g6[4], y); cap("AMOUNT PAID", g6[4] + 16, y); val(`$ ${money(f.amountPaid)}`, g6[4] + 8, y + 12, 8.5);
  num("30.", g6[5], y); cap("Rsvd for NUCC Use", g6[5] + 16, y);
  y += H_R2530;

  // ===== 31 / 32 / 33 =======================================================
  const facility = [provider.practiceName, [provider.addressLine1, provider.addressLine2].filter(Boolean).join(" "), [provider.city, provider.region, provider.postal].filter(Boolean).join(" ")].filter(Boolean) as string[];
  const t3 = [L, L + CW / 3, L + (CW * 2) / 3, R];
  rowFrame(y, H_R3133, t3);
  num("31.", t3[0], y); cap("SIGNATURE OF PHYSICIAN OR SUPPLIER", t3[0] + 16, y); cap("INCLUDING DEGREES OR CREDENTIALS", t3[0] + 16, y + 7);
  txt(f.signature ?? "", t3[0] + 4, y + H_R3133 - 12, { font: ital, size: 8, color: INK });
  num("32.", t3[1], y); cap("SERVICE FACILITY LOCATION INFORMATION", t3[1] + 16, y);
  facility.forEach((s, k) => val(s, t3[1] + 4, y + 12 + k * 9, 7));
  txt(`a. ${provider.npi ?? ""}`, t3[1] + 4, y + H_R3133 - 8, { size: 6, color: INK });
  num("33.", t3[2], y); cap("BILLING PROVIDER INFO & PH#", t3[2] + 16, y);
  if (provider.phone) rtxt(provider.phone, R - 4, y + 0.5, { size: 6.5, color: INK });
  facility.forEach((s, k) => val(s, t3[2] + 4, y + 12 + k * 9, 7));
  txt(`a. ${provider.npi ?? ""}`, t3[2] + 4, y + H_R3133 - 8, { size: 6, color: INK });
  y += H_R3133;

  // ===== Footer =============================================================
  txt("NUCC Instruction Manual available at: www.nucc.org", L, y + 4, { size: 6 });
  txt("PLEASE PRINT OR TYPE", L + CW / 2 - 34, y + 4, { font: ital, size: 6 });
  rtxt("APPROVED OMB-0938-1197 FORM 1500 (02-12)", R, y + 4, { size: 6 });

  // Full outer frame (draw last so it sits crisply over the inner rules).
  box(L, frameTop, CW, y - frameTop, RED, 1);

  // ---- row frame: outer box + internal vertical dividers at xs[] ----------
  function rowFrame(top: number, h: number, xs: number[]) {
    box(xs[0], top, xs[xs.length - 1] - xs[0], h);
    for (let i = 1; i < xs.length - 1; i++) vline(xs[i], top, top + h);
  }

  // ---- a patient/insured address cell (5 and 7) ---------------------------
  function addrCell(n: string, label: string, addr: { street?: string; city?: string; state?: string; zip?: string }, phone: string | undefined, x0: number, top: number, x1: number) {
    num(n, x0, top); cap(label, x0 + 14, top); val(addr.street ?? "", x0 + 4, top + 9, 8);
    const third = H_ADDR / 3;
    hline(x0, x1, top + third, HAIR, 0.6);
    cap("CITY", x0 + 2, top + third); val(addr.city ?? "", x0 + 20, top + third + 0.5, 7.5);
    cap("STATE", x1 - 40, top + third); val(addr.state ?? "", x1 - 16, top + third + 0.5, 7.5);
    hline(x0, x1, top + third * 2, HAIR, 0.6);
    cap("ZIP CODE", x0 + 2, top + third * 2); val(addr.zip ?? "", x0 + 34, top + third * 2 + 0.5, 7.5);
    cap("TELEPHONE", x1 - 68, top + third * 2); if (phone) val(phone, x1 - 34, top + third * 2 + 0.5, 7.5);
  }
}
