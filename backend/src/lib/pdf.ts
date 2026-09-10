/**
 * PDF extraction — every text run on every page with its position, plus the filled rectangles
 * (chart bars). The parser in services/pdfReport.ts works on this shape only, so it can be tested
 * without pdf.js and pdf.js can be swapped without touching the parser.
 */
import { badRequest } from "./http";

export interface TextItem {
  /** left edge and baseline in PDF points (origin bottom-left) */
  x: number; y: number;
  /** rendered width in points; x + w is the right edge, which right-aligned cells share */
  w: number;
  s: string;
}
/** A filled rectangle in page points, normalised so w and h are positive; fill is "r,g,b". */
export interface Rect { x: number; y: number; w: number; h: number; fill: string | null }
export interface PageText { page: number; width: number; height: number; items: TextItem[]; rects: Rect[] }

/** Runs that carry no letter, digit or accounting symbol (Excel's padding cells) are dropped. */
const MEANINGFUL = /[\p{L}\p{N}#%$()\-–]/u;

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

type Matrix = [number, number, number, number, number, number];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

/** Walk the page's drawing operators and collect filled rectangles in page coordinates. */
function collectRects(fnArray: number[], argsArray: unknown[][], OPS: Record<string, number>): Rect[] {
  const rects: Rect[] = [];
  const seen = new Set<string>();
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let fill: string | null = null;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(a as unknown as Matrix, ctm);
    else if (fn === OPS.setFillRGBColor) fill = (a as number[]).map((c) => Math.round(c)).join(",");
    else if (fn === OPS.constructPath) {
      const [subops, args] = a as [number[], number[]];
      let j = 0;
      for (const o of subops) {
        if (o === OPS.rectangle) {
          const [x, y, w, h] = args.slice(j, j + 4); j += 4;
          let X = x * ctm[0] + y * ctm[2] + ctm[4], Y = x * ctm[1] + y * ctm[3] + ctm[5];
          let W = w * ctm[0] + h * ctm[2], H = w * ctm[1] + h * ctm[3];
          if (W < 0) { X += W; W = -W; }
          if (H < 0) { Y += H; H = -H; }
          if (W < 0.5 || H < 0.5) continue;
          const key = `${X.toFixed(1)}/${Y.toFixed(1)}/${W.toFixed(1)}/${H.toFixed(1)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rects.push({ x: X, y: Y, w: W, h: H, fill });
        } else if (o === OPS.moveTo || o === OPS.lineTo) j += 2;
        else if (o === OPS.curveTo) j += 6;
        else if (o === OPS.curveTo2 || o === OPS.curveTo3) j += 4;
      }
    }
  }
  return rects;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PageText[]> {
  if (!isPdf(bytes)) throw badRequest("The file is not a PDF");
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  try {
    const pages: PageText[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        const s = it.str.replace(/ /g, " ").replace(/\s+/g, " ").trim();
        if (!s || !MEANINGFUL.test(s)) continue;
        items.push({ x: it.transform[4], y: it.transform[5], w: it.width, s });
      }
      let rects: Rect[] = [];
      try {
        const ops = await page.getOperatorList();
        rects = collectRects(ops.fnArray, ops.argsArray as unknown[][], OPS as unknown as Record<string, number>);
      } catch { /* charts are a bonus; text is what matters */ }
      const [x0, y0, x1, y1] = page.view;
      pages.push({ page: p, width: x1 - x0, height: y1 - y0, items, rects });
      page.cleanup();
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}
