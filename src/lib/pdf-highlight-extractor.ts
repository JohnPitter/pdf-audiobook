import * as pdfjsLib from "pdfjs-dist";
import { OPS } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface HighlightedSegment {
  pageNumber: number;
  text: string;
  color: string;
}

export interface ExtractionResult {
  allText: string;
  highlightedSegments: HighlightedSegment[];
  totalPages: number;
  hasHighlights: boolean;
}

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Colors that are NOT highlights — they're part of the normal PDF layout.
 * White, near-white, black, and common UI grays.
 */
const LAYOUT_COLORS = new Set([
  "#ffffff",
  "#fafafa",
  "#f5f5f5",
  "#f0f0f0",
  "#e0e0e0",
  "#000000",
  "#505050",
  "#969696",
  "#808080",
  "#333333",
]);

/**
 * Known highlight-like colors that appear as ink annotations or fill backgrounds.
 */
function isHighlightFillColor(hex: string): boolean {
  if (LAYOUT_COLORS.has(hex)) return false;

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Yellow highlights
  if (r > 0.8 && g > 0.7 && b < 0.6) return true;
  // Green highlights
  if (r < 0.6 && g > 0.7 && b < 0.6) return true;
  // Pink/red highlights
  if (r > 0.8 && g < 0.5 && b < 0.6) return true;
  // Blue highlights
  if (r < 0.5 && g < 0.7 && b > 0.7) return true;
  // Cyan
  if (r < 0.5 && g > 0.7 && b > 0.7) return true;
  // Light purple
  if (r > 0.6 && g < 0.5 && b > 0.7) return true;

  return false;
}

/**
 * Extract bounding box from a constructPath arguments.
 * constructPath args: [commands, coords, bbox]
 * bbox format: { 0: minX, 1: minY, 2: maxX, 3: maxY }
 */
function extractBboxFromPath(args: unknown[]): Rect | null {
  // The bbox is typically the last argument (index 2)
  const bbox = args[2] as Record<string, number> | undefined;
  if (bbox && typeof bbox === "object" && "0" in bbox && "1" in bbox && "2" in bbox && "3" in bbox) {
    return {
      minX: Math.min(bbox[0], bbox[2]),
      minY: Math.min(bbox[1], bbox[3]),
      maxX: Math.max(bbox[0], bbox[2]),
      maxY: Math.max(bbox[1], bbox[3]),
    };
  }
  return null;
}

/**
 * Merge overlapping/adjacent rectangles into larger regions.
 * Two rects merge if they overlap or are within `gap` units of each other on Y axis.
 */
function mergeRects(rects: Rect[], gap = 3): Rect[] {
  if (rects.length === 0) return [];

  // Sort by minY descending (top of page first in PDF coords)
  const sorted = [...rects].sort((a, b) => b.minY - a.minY);
  const merged: Rect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Merge if Y ranges overlap or are close enough
    if (current.maxY >= last.minY - gap && current.minY <= last.maxY + gap) {
      last.minX = Math.min(last.minX, current.minX);
      last.minY = Math.min(last.minY, current.minY);
      last.maxX = Math.max(last.maxX, current.maxX);
      last.maxY = Math.max(last.maxY, current.maxY);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Extracts all text and highlighted segments from a PDF.
 *
 * Supports three highlight detection strategies:
 * 1. Standard PDF annotations (Highlight, Underline, etc.)
 * 2. Google Docs ink annotations (GOOG:INKIsInker marked content with colored paths)
 * 3. Colored background rectangles drawn before text
 */
export async function extractHighlightsFromPdf(
  file: File,
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf: PDFDocumentProxy = await pdfjsLib.getDocument({
    data: arrayBuffer,
  }).promise;

  const allTextParts: string[] = [];
  const highlightedSegments: HighlightedSegment[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // 1. Extract full page text
    const textContent = await page.getTextContent();
    const textItems = textContent.items.filter(
      (item): item is typeof item & { str: string; transform: number[]; width: number; height: number } =>
        "str" in item && "transform" in item,
    );

    const pageText = textItems
      .filter((item) => item.str.trim())
      .map((item) => item.str)
      .join(" ");
    allTextParts.push(pageText);

    // 2. Collect highlight rects from operator list (ink annotations + colored backgrounds)
    const ops = await page.getOperatorList();
    const highlightRects: { rect: Rect; color: string }[] = [];

    let currentFillColor = "";
    let insideInkMarker = false;

    for (let i = 0; i < ops.fnArray.length; i++) {
      const op = ops.fnArray[i];
      const args = ops.argsArray[i];

      switch (op) {
        case OPS.beginMarkedContent:
        case OPS.beginMarkedContentProps: {
          const tag = args[0];
          const props = args.length > 1 ? args[1] : args[0];
          if (
            (typeof tag === "string" && tag.includes("INK")) ||
            (typeof props === "object" && props?.name?.includes?.("INK"))
          ) {
            insideInkMarker = true;
          }
          break;
        }

        case OPS.endMarkedContent:
          insideInkMarker = false;
          break;

        case OPS.setFillRGBColor:
          currentFillColor = args[0] as string;
          break;

        case OPS.constructPath: {
          // Google Docs ink highlights: constructPath inside GOOG:INKIsInker
          if (insideInkMarker && isHighlightFillColor(currentFillColor)) {
            const bbox = extractBboxFromPath(args);
            if (bbox) {
              highlightRects.push({ rect: bbox, color: currentFillColor });
            }
          }
          break;
        }

        case OPS.rectangle: {
          // Standard colored background rectangles
          if (
            !insideInkMarker &&
            isHighlightFillColor(currentFillColor) &&
            currentFillColor !== "#ff9642" // Skip table header orange
          ) {
            const [x, y, w, h] = args as number[];
            highlightRects.push({
              rect: {
                minX: Math.min(x, x + w),
                minY: Math.min(y, y + h),
                maxX: Math.max(x, x + w),
                maxY: Math.max(y, y + h),
              },
              color: currentFillColor,
            });
          }
          break;
        }
      }
    }

    // 3. Also check standard PDF annotations
    const annotations = await page.getAnnotations();
    for (const ann of annotations) {
      if (
        ann.subtype === "Highlight" ||
        ann.subtype === "Underline" ||
        ann.subtype === "Squiggly"
      ) {
        if (ann.rect) {
          const [x1, y1, x2, y2] = ann.rect;
          highlightRects.push({
            rect: {
              minX: Math.min(x1, x2),
              minY: Math.min(y1, y2),
              maxX: Math.max(x1, x2),
              maxY: Math.max(y1, y2),
            },
            color: ann.color
              ? `rgb(${ann.color.join(",")})`
              : "#fdd663",
          });
        }
      }
    }

    if (highlightRects.length === 0) continue;

    // 4. Merge nearby rects into larger highlight regions
    const allRects = highlightRects.map((h) => h.rect);
    const mergedRegions = mergeRects(allRects, 8);
    const primaryColor = highlightRects[0]?.color ?? "#fdd663";

    // 5. Match text items to merged highlight regions
    for (const region of mergedRegions) {
      const matchedItems: { str: string; x: number; y: number }[] = [];

      for (const item of textItems) {
        if (!item.str.trim()) continue;

        const tx = item.transform[4]; // x position
        const ty = item.transform[5]; // y position

        // PDF coordinates: Y goes up from bottom
        // Check if text falls within the highlight region (with tolerance)
        const tolerance = 5;
        if (
          tx >= region.minX - tolerance &&
          tx <= region.maxX + tolerance &&
          ty >= region.minY - tolerance &&
          ty <= region.maxY + tolerance
        ) {
          matchedItems.push({ str: item.str, x: tx, y: ty });
        }
      }

      if (matchedItems.length > 0) {
        // Sort by Y descending (top first), then X ascending (left to right)
        matchedItems.sort((a, b) => {
          const yDiff = b.y - a.y;
          if (Math.abs(yDiff) > 3) return yDiff;
          return a.x - b.x;
        });

        const text = matchedItems.map((m) => m.str).join(" ");
        if (text.trim()) {
          highlightedSegments.push({
            pageNumber: pageNum,
            text: text.trim(),
            color: primaryColor,
          });
        }
      }
    }
  }

  return {
    allText: allTextParts.join("\n\n"),
    highlightedSegments,
    totalPages: pdf.numPages,
    hasHighlights: highlightedSegments.length > 0,
  };
}
