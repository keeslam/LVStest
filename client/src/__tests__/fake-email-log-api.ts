/**
 * A stand-in for the e-mail log routes in page tests: the table asks
 * /api/email-logs/search for one page, the Analyse tab /api/email-logs/summary
 * and the CSV button /api/email-logs/export. The answers follow the server
 * (server/services/email-log-query.ts) closely enough for the page: newest
 * first, the q/status/scope filters, the totals per kind.
 */
type Row = {
  id: number; template: string; subject: string; recipients: number; emailsSent: number; emailsFailed: number;
  failureReason: string | null; sentAt: string; recipient: string | null; result: string | null;
  vehicleIds?: number[] | null; documentId?: number | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function statusOf(row: Row): "sent" | "failed" | "partial" {
  if (row.result === "sent") return "sent";
  if (row.result === "failed") return "failed";
  if (row.emailsFailed > 0) return row.emailsSent > 0 ? "partial" : "failed";
  return "sent";
}

function matching(rows: Row[], params: URLSearchParams): Row[] {
  const q = params.get("q")?.toLowerCase();
  const status = params.get("status");
  const scope = params.get("scope");
  return rows
    .filter((r) => !q || [r.subject, r.recipient, r.failureReason].some((v) => v?.toLowerCase().includes(q)))
    .filter((r) => !status || statusOf(r) === status)
    .filter((r) => scope !== "mails" || r.recipient !== null)
    .filter((r) => scope !== "runs" || r.recipient === null)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || b.id - a.id)
    .map((r) => ({ ...r, vehicles: [] as Array<{ id: number; licensePlate: string }> }));
}

function summary(rows: Row[]) {
  const mails = rows.filter((r) => r.recipient);
  const count = (list: Row[], s: string) => list.filter((r) => statusOf(r) === s).length;
  const kind = (name: string) => {
    const list = mails.filter((r) => (name === "other" ? !["apk", "maintenance", "custom"].includes(r.template) : r.template === name));
    return { sent: count(list, "sent"), failed: count(list, "failed") };
  };
  const runs = rows.filter((r) => !r.recipient);
  return {
    sent: count(mails, "sent"), failed: count(mails, "failed"),
    runs: runs.length, runsWithFailures: runs.filter((r) => r.emailsFailed > 0).length,
    kinds: { apk: kind("apk"), maintenance: kind("maintenance"), custom: kind("custom"), other: kind("other") },
  };
}

/** The response for an e-mail log URL, or null when the URL is not one of them. */
export function fakeEmailLogResponse(url: string, rows: Row[]): Response | null {
  if (!url.includes("/api/email-logs")) return null;
  const parsed = new URL(url, "http://localhost");
  if (parsed.pathname.endsWith("/summary")) return json(summary(rows));
  const found = matching(rows, parsed.searchParams);
  if (parsed.pathname.endsWith("/export")) return json({ rows: found, truncated: false });
  const pageSize = Number(parsed.searchParams.get("pageSize") ?? 50);
  const page = Number(parsed.searchParams.get("page") ?? 1);
  return json({ rows: found.slice((page - 1) * pageSize, page * pageSize), total: found.length, page, pageSize });
}
