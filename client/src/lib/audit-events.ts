/**
 * The activity log's view of what happens in the browser.
 *
 * The server logs every file it serves (server/middleware/audit.ts
 * TRACKED_READS), but two things never reach it: a print the browser does from
 * a preview it already loaded, and a label, barcode book or report the client
 * renders itself. These helpers report those, so "who printed the contract"
 * and "who exported the fines" have an answer.
 *
 * Reporting is fire-and-forget: a failed report must never stop the print or
 * the download, and the server's row is written from its own session, never
 * from anything the browser claims about the user.
 */

export type ClientAuditAction = "label.print" | "barcode-book.print" | "report.print" | "report.export";

/** `/api/documents/view/12` -> `/api/documents/view/12?intent=print`: the server logs that request as a print. */
export function withPrintIntent(url: string): string {
  return url.includes("?") ? `${url}&intent=print` : `${url}?intent=print`;
}

async function post(body: Record<string, unknown>): Promise<void> {
  try {
    if (typeof fetch !== "function") return;
    // Loaded on demand so this module stays importable in the plain-node tests
    // of the CSV writer, which has no query client around it.
    const { apiRequest } = await import("./queryClient");
    await apiRequest("POST", "/api/audit-events", body);
  } catch {
    // Deliberately silent: see the module comment.
  }
}

/** A file the browser printed from a preview it already had, by the URL that preview loaded. */
export function reportPrinted(url: string): void {
  const path = url.split("?")[0];
  if (!path.startsWith("/api/")) return;
  void post({ printedUrl: path });
}

/** Something the client rendered and printed or exported itself. */
export function reportClientAction(
  action: ClientAuditAction,
  input: { resourceType?: string; resourceId?: number; details?: Record<string, unknown> } = {},
): void {
  void post({ action, ...input });
}
