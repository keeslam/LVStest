import type { Response } from "express";
import path from "path";

/**
 * Files a customer (or staff) uploaded are served back with a type WE decide, not the one the browser claimed
 * at upload time. Only PDF, PNG and JPEG are shown inline; anything else is a download. The sandbox policy and
 * nosniff mean that even a file with the wrong content could not run as a page of this application.
 */
const INLINE_TYPES: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const INLINE_VALUES = new Set(Object.values(INLINE_TYPES));

export function safeContentType(declared: string | null | undefined, fileName: string): string {
  const fromName = INLINE_TYPES[path.extname(fileName).toLowerCase()];
  const exact = (declared ?? "").trim().toLowerCase();
  // The declared type only counts when it is exactly one of the three and agrees with the extension.
  if (fromName && INLINE_VALUES.has(exact) && exact === fromName) return fromName;
  return fromName ?? "application/octet-stream";
}

/**
 * Content-Type, nosniff, sandbox and a disposition that is "inline" only for the three safe types.
 *
 * `sandboxInline: false` (the staff document routes) leaves the sandbox off a PDF or image shown inline:
 * the sandbox makes the file a foreign origin, and the staff screens print a contract from their own
 * preview window. The type still comes from the file name and nosniff still holds, so nothing but a
 * PDF or an image is ever shown inline; every other file stays a sandboxed download.
 */
export function setSafeFileHeaders(res: Response, declared: string | null | undefined, fileName: string, wantInline: boolean, downloadName: string, opts: { sandboxInline?: boolean } = {}): void {
  const type = safeContentType(declared, fileName);
  const inline = wantInline && INLINE_VALUES.has(type);
  res.setHeader("Content-Type", type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!inline || opts.sandboxInline !== false) {
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  }
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${downloadName}"`);
}
