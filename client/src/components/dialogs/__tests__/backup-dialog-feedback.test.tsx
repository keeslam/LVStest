/**
 * Audit 2026-10-09 module 17: A-17-3 (a failed "Nu back-uppen" says why, in
 * Dutch, not "500: {json}"; the last error is not the English text), A-17-4
 * (a backup dated 1970 reads "Onbekende datum"; an old last backup gets a
 * visible warning).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "kees", role: "admin", permissions: [] }, isLoading: false }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
  toast: (...a: unknown[]) => toast(...a),
}));

import { BackupDialog } from "@/components/dialogs/backup-dialog";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let runAnswer: Response | null = null;
let health: object = {};
let status: object = { isRunning: false };

const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("/api/backups/run") && init?.method === "POST") return runAnswer!;
  if (u.includes("/api/backups/status")) return json(status);
  if (u.includes("/api/backups/health")) return json(health);
  if (u.includes("/api/backup-settings")) {
    return json({ id: 1, enableAutoBackup: true, localPath: "", storageType: "local", backupSchedule: "", retentionDays: 30 });
  }
  if (u.includes("/api/backups/list")) {
    return json([
      {
        timestamp: "1970-01-01T00:00:00.000Z",
        type: u.includes("files") ? "files" : "database",
        filename: "files-backup-2025-10-13.tar.gz",
        size: 10,
        checksum: "x",
      },
    ]);
  }
  return json([]);
});

function renderDialog() {
  queryClient.clear();
  return render(
    <QueryClientProvider client={queryClient}>
      <BackupDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toast.mockClear();
  health = {
    lastSuccessAt: new Date().toISOString(),
    ageHours: 1,
    stale: false,
    lastError: null,
    backupPath: "/b",
    backupPathFromEnv: true,
  };
  status = { isRunning: false, lastSuccess: new Date().toISOString() };
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backup dialog", () => {
  it("a failed 'Nu back-uppen' explains the reason in Dutch, without raw JSON", async () => {
    runAnswer = json(
      { error: "The backup failed. Check the server log for details.", code: "BACKUP_FAILED", reason: "TOOL_MISSING" },
      500,
    );
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-run-backup-now-button"));
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    const arg = toast.mock.calls[0][0];
    expect(arg.variant).toBe("destructive");
    expect(arg.description).toMatch(/back-upprogramma/);
    expect(arg.description).not.toMatch(/500|\{|The backup failed/);
  });

  it("a backup that is already running gets its own sentence", async () => {
    runAnswer = json({ error: "A backup is already running.", code: "BACKUP_ALREADY_RUNNING" }, 409);
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-run-backup-now-button"));
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].description).toBe("Er loopt al een back-up. Wacht tot die klaar is.");
  });

  it("shows the last error as a Dutch sentence chosen by its code", async () => {
    status = {
      isRunning: false,
      lastError: "2026-10-09T01:00:00.000Z: pg_dump executable not found",
      lastErrorCode: "TOOL_MISSING",
    };
    renderDialog();
    expect(await screen.findByText(/back-upprogramma/)).toBeInTheDocument();
    expect(screen.queryByText(/pg_dump executable not found/)).toBeNull();
  });

  it("warns at the top when the last backup is older than a day", async () => {
    health = {
      lastSuccessAt: "2026-08-23T10:00:00.000Z",
      ageHours: 1200,
      stale: true,
      lastError: null,
      backupPath: "/b",
      backupPathFromEnv: true,
    };
    renderDialog();
    const warning = await screen.findByTestId("backup-old-warning");
    expect(warning).toHaveTextContent("De laatste geslaagde back-up is ouder dan een dag");
  });

  it("shows no old-backup warning when the last backup is recent", async () => {
    renderDialog();
    await screen.findByTestId("dialog-run-backup-now-button");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("backup-old-warning")).toBeNull();
  });

  it("a backup dated 1970 reads 'Onbekende datum', never 1 jan 1970", async () => {
    renderDialog();
    expect((await screen.findAllByText(/Onbekende datum/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1970/)).toBeNull();
  });

  it("A-19-8: a downloaded data backup is announced with its file name and size", async () => {
    const download = vi.fn(async () => new Response("x".repeat(2048), { status: 200 }));
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) =>
      String(url).includes("/api/backups/download-data") ? download() : fetchMock(url, init)));
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("dialog-download-data-button"));
    await vi.waitFor(() => expect(download).toHaveBeenCalled());
    await vi.waitFor(() => {
      const last = toast.mock.calls[toast.mock.calls.length - 1][0];
      expect(last.title).toBe("Bestand gemaakt");
    });
    const last = toast.mock.calls[toast.mock.calls.length - 1][0];
    expect(last.description).toMatch(/^car-rental-data-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]sql [(]2 kB[)]$/);
  });
});
