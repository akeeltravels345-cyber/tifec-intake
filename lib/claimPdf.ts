// =============================================================================
// claimPdf is the pixel-exact CMS-1500 (08-05) generator — a literal duplicate of
// Practice Perfect's claim form (its own blank-form image with our data typed
// over it at the exact coordinates). It replaced the hand-drawn 02-12 facsimile
// so the emailed and stored claim match what the biller prints. Implementation
// lives in lib/cms1500Pdf.ts.
// =============================================================================
export { cms1500Pdf as claimPdf, type ClaimProvider } from "./cms1500Pdf";
