/**
 * Logboek of the invoice inbox (client/src/components/expenses/invoice-inbox-log-dialog.tsx).
 * Design: docs/superpowers/specs/2026-09-20-invoice-inbox-log-design.md
 *
 * The dialog needs rows in `invoice_inbox_items` / `invoice_inbox_runs` that the
 * seed never creates, so this Layer B spec writes them straight into `lvs_e2e`
 * with `pg` (constraints.md: no `psql` on PATH here) in `beforeAll`, and removes
 * exactly those rows again in `afterAll`.
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { test, expect, settle, watchPage } from "../../support/guards";
import { authFile } from "../../support/roles";
import { E2E } from "../../support/env";

// Every seeded row carries this subject prefix, so afterAll can delete exactly
// (and only) what beforeAll inserted, independent of the ids Postgres assigns.
const SUBJECT_PREFIX = "E2E-LOG";

// node_modules/@radix-ui/react-dialog's TitleWarning component (dist/index.mjs),
// verbatim: `${CONTENT_NAME}` requires a `${TITLE_NAME}` ..., CONTENT_NAME =
// "DialogContent", TITLE_NAME = "DialogTitle". SettingsDialog
// (client/src/components/settings/settings-dialog.tsx) wraps SettingsPanel
// directly with no DialogTitle, so Chrome logs this console.error every time it
// opens — a pre-existing, already-documented finding
// (.superpowers/sdd/2026-09-20-e2e-browser-tests/task-7-report.md, finding 1;
// e2e/layer-a/dialogs.spec.ts marks its one admin x menu-settings test `fixme`
// for the same reason). Not something this test introduces, so it is filtered
// out below by its exact text rather than by loosening the guard.
const KNOWN_SETTINGS_DIALOG_TITLE_WARNING =
  "`DialogContent` requires a `DialogTitle` for the component to be accessible for screen reader users.\n\n" +
  "If you want to hide the `DialogTitle`, you can wrap it with our VisuallyHidden component.\n\n" +
  "For more information, see https://radix-ui.com/primitives/docs/components/dialog";

let client: pg.Client;
let vehicleId: number;
let bookedId: number;
let reviewPlateUnknownId: number;
let reviewParseFailedId: number;
let otherNoAttachmentId: number;
let otherNotInvoiceId: number;
let runSchedulerWithMailId: number;
let runSchedulerEmptyId: number;
let runManualFailedId: number;

test.describe("Instellingen: Logboek van het factuurpostvak", () => {
  test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 900 } });

  test.beforeAll(async () => {
    // Guard what this spec ever writes to / deletes from, independent of the
    // "Global Constraints" check the harness itself already does.
    if (!E2E.databaseUrl.endsWith("/lvs_e2e")) {
      throw new Error(`Refusing to seed ${E2E.databaseUrl}; this spec only ever touches lvs_e2e.`);
    }
    client = new pg.Client({ connectionString: E2E.databaseUrl });
    await client.connect();

    const vehicle = await client.query<{ id: number }>(
      `SELECT id FROM vehicles WHERE license_plate = $1`,
      ["E2E-01-A"],
    );
    if (vehicle.rowCount === 0) throw new Error("Seed vehicle E2E-01-A not found; did the setup/seed project run?");
    vehicleId = vehicle.rows[0].id;

    const now = Date.now();
    const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);
    const plusSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

    // --- Facturen tab: one booked, two "review" with different reasons -------
    const booked = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_items
         (from_address, subject, attachment_name, attachment_hash, attachment_content_type, parsed, status, vehicle_id, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        "facturatie@garagejansen.e2e.invalid",
        `${SUBJECT_PREFIX} Factuur Garage Jansen B.V. 2026-0412`,
        "garage-jansen-2026-0412.pdf",
        "e2e-log-hash-booked",
        "application/pdf",
        JSON.stringify({ vendor: "Garage Jansen B.V.", invoiceNumber: "2026-0412", invoiceDate: "2026-09-15", currency: "EUR", totalAmount: 486.35, lineItems: [] }),
        "booked",
        vehicleId,
        minutesAgo(50),
      ],
    );
    bookedId = booked.rows[0].id;

    const reviewPlateUnknown = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_items
         (from_address, subject, attachment_name, attachment_hash, attachment_content_type, parsed, status, review_reason, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        "info@bandenhuisnoord.e2e.invalid",
        `${SUBJECT_PREFIX} Bandenhuis Noord factuur F-88213`,
        "bandenhuis-noord-f-88213.pdf",
        "e2e-log-hash-plate-unknown",
        "application/pdf",
        JSON.stringify({ vendor: "Bandenhuis Noord", invoiceNumber: "F-88213", invoiceDate: "2026-09-16", currency: "EUR", totalAmount: 1249, lineItems: [] }),
        "review",
        "plate_unknown",
        minutesAgo(45),
      ],
    );
    reviewPlateUnknownId = reviewPlateUnknown.rows[0].id;

    const reviewParseFailed = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_items
         (from_address, subject, attachment_name, attachment_hash, attachment_content_type, status, review_reason, error_message, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        "scans@onbekend.e2e.invalid",
        `${SUBJECT_PREFIX} onleesbare factuur bijlage`,
        "onleesbare-factuur.pdf",
        "e2e-log-hash-parse-failed",
        "application/pdf",
        "review",
        "parse_failed",
        "Gemini kon de bijlage niet uitlezen: onverwacht antwoordformaat.",
        minutesAgo(40),
      ],
    );
    reviewParseFailedId = reviewParseFailed.rows[0].id;

    // --- Overige mail tab: no_attachment (still "review") and not_invoice (dismissed) ---
    const otherNoAttachment = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_items
         (from_address, subject, attachment_hash, status, review_reason, received_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        "onbekend@e2e.invalid",
        `${SUBJECT_PREFIX} mail zonder bijlage`,
        "e2e-log-hash-no-attachment",
        "review",
        "no_attachment",
        minutesAgo(35),
      ],
    );
    otherNoAttachmentId = otherNoAttachment.rows[0].id;

    const otherNotInvoice = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_items
         (from_address, subject, attachment_name, attachment_hash, status, review_reason, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        "verkoop@garagevisser.e2e.invalid",
        `${SUBJECT_PREFIX} offerte onderhoud (geen factuur)`,
        "offerte-onderhoud.pdf",
        "e2e-log-hash-not-invoice",
        "dismissed",
        "not_invoice",
        minutesAgo(30),
      ],
    );
    otherNotInvoiceId = otherNotInvoice.rows[0].id;

    // --- Ophaalrondes tab: scheduler-with-mail, empty scheduler, failed manual ---
    const startedWithMail = minutesAgo(60);
    const runWithMail = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_runs
         (started_at, finished_at, trigger, mails, attachments, booked, review, skipped, failed, errors)
       VALUES ($1, $2, 'scheduler', 1, 1, 1, 0, 0, 0, $3)
       RETURNING id`,
      [startedWithMail, plusSeconds(startedWithMail, 8), JSON.stringify([])],
    );
    runSchedulerWithMailId = runWithMail.rows[0].id;

    const startedEmpty = minutesAgo(45);
    const emptyRun = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_runs
         (started_at, finished_at, trigger, mails, attachments, booked, review, skipped, failed, errors)
       VALUES ($1, $2, 'scheduler', 0, 0, 0, 0, 0, 0, $3)
       RETURNING id`,
      [startedEmpty, plusSeconds(startedEmpty, 2), JSON.stringify([])],
    );
    runSchedulerEmptyId = emptyRun.rows[0].id;

    const startedManual = minutesAgo(30);
    const manualRun = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_runs
         (started_at, finished_at, trigger, triggered_by, mails, attachments, booked, review, skipped, failed, errors)
       VALUES ($1, $2, 'manual', $3, 0, 0, 0, 0, 0, 1, $4)
       RETURNING id`,
      [
        startedManual,
        plusSeconds(startedManual, 5),
        "e2e-admin",
        JSON.stringify(["Verbinding met imap.voorbeeld.nl mislukt: connect ECONNREFUSED 127.0.0.1:993"]),
      ],
    );
    runManualFailedId = manualRun.rows[0].id;
  });

  test.afterAll(async () => {
    await client.query(`DELETE FROM invoice_inbox_items WHERE subject LIKE $1`, [`${SUBJECT_PREFIX}%`]);
    await client.query(`DELETE FROM invoice_inbox_runs WHERE id = ANY($1::int[])`, [
      [runSchedulerWithMailId, runSchedulerEmptyId, runManualFailedId],
    ]);
    await client.end();
  });

  test("toont facturen, overige mail en ophaalrondes; zoeken en filters werken", async ({ page }) => {
    // watchPage(), not the `health` fixture: the Settings dialog's known,
    // already-documented DialogTitle warning (see the constant above) would
    // otherwise unconditionally fail `health`'s own teardown assertion.
    const watcher = await watchPage(page);

    const shotsDir = path.join(E2E.tmp, "shots");
    fs.mkdirSync(shotsDir, { recursive: true });

    await test.step("Instellingen openen op tabblad E-mail", async () => {
      await page.goto("/");
      await settle(page);
      await page.getByTestId("user-menu-button").click();
      await page.getByTestId("menu-settings").click();
      const settingsDialog = page.locator('[role="dialog"], [role="alertdialog"]').last();
      await expect(settingsDialog).toBeVisible();
      // The trigger has no data-testid of its own (settings-panel.tsx); "E-mail
      // & GPS" is the full label shown at this viewport width ("hidden
      // sm:inline"), unique among the tab strip's labels.
      await settingsDialog.getByRole("tab", { name: "E-mail & GPS", exact: true }).click();
      await settle(page);
    });

    // InvoiceInboxLogButton renders its own nested Dialog (invoice-inbox-log-dialog.tsx);
    // matched by its DialogTitle ("Logboek") rather than DOM position, since the
    // Settings dialog underneath stays mounted and open the whole time.
    const logDialog = page.getByRole("dialog", { name: "Logboek" });

    await test.step("Logboek openen: tabblad Facturen toont de drie factuurregels, niet de twee overige-mailregels", async () => {
      // InvoiceInboxConfigForm renders null until its config query resolves, and
      // the button sits at the bottom of the E-mail tab's card list.
      const openButton = page.getByTestId("button-invoice-inbox-log");
      await openButton.scrollIntoViewIfNeeded();
      await openButton.click();
      await expect(logDialog).toBeVisible();
      await settle(page);

      await expect(logDialog.getByTestId("tab-invoice-inbox-log-invoices")).toHaveAttribute("data-state", "active");
      await expect(logDialog.locator("tbody tr")).toHaveCount(3);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${bookedId}`)).toBeVisible();
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${reviewPlateUnknownId}`)).toBeVisible();
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${reviewParseFailedId}`)).toBeVisible();
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${otherNoAttachmentId}`)).toHaveCount(0);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${otherNotInvoiceId}`)).toHaveCount(0);

      await page.screenshot({ path: path.join(shotsDir, "logboek-facturen.png") });
    });

    await test.step("Zoeken op factuurnummer laat alleen de Bandenhuis-regel over", async () => {
      await logDialog.getByTestId("input-invoice-inbox-log-search").fill("f-88213");
      await settle(page);
      await expect(logDialog.locator("tbody tr")).toHaveCount(1);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${reviewPlateUnknownId}`)).toBeVisible();
    });

    await test.step("Zoeken op kenteken zonder streepjes laat alleen de Garage Jansen-regel over", async () => {
      await logDialog.getByTestId("input-invoice-inbox-log-search").fill("e2e01a");
      await settle(page);
      await expect(logDialog.locator("tbody tr")).toHaveCount(1);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${bookedId}`)).toBeVisible();
    });

    await test.step("Zoekterm wissen + status 'Te controleren' laat de twee 'te controleren'-regels over", async () => {
      await logDialog.getByTestId("input-invoice-inbox-log-search").fill("");
      await settle(page);
      await logDialog.getByTestId("select-invoice-inbox-log-status").click();
      await page.getByRole("option", { name: "Te controleren", exact: true }).click();
      await settle(page);
      await expect(logDialog.locator("tbody tr")).toHaveCount(2);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${reviewPlateUnknownId}`)).toBeVisible();
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${reviewParseFailedId}`)).toBeVisible();
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${bookedId}`)).toHaveCount(0);
    });

    await test.step("Tabblad Overige mail toont exact de twee overige-mailregels", async () => {
      await logDialog.getByTestId("tab-invoice-inbox-log-other").click();
      await settle(page);
      await expect(logDialog.locator("tbody tr")).toHaveCount(2);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${otherNoAttachmentId}`)).toBeVisible();
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-${otherNotInvoiceId}`)).toBeVisible();

      await page.screenshot({ path: path.join(shotsDir, "logboek-overige-mail.png") });
    });

    await test.step("Tabblad Ophaalrondes: schakelaar aan toont 2 rondes, uit toont 3; de handmatige ronde toont wie en de foutmelding", async () => {
      await logDialog.getByTestId("tab-invoice-inbox-log-runs").click();
      await settle(page);

      const activeSwitch = logDialog.getByTestId("switch-invoice-inbox-log-active");
      await expect(activeSwitch).toBeChecked();
      await expect(logDialog.locator("tbody tr")).toHaveCount(2);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-run-${runSchedulerEmptyId}`)).toHaveCount(0);

      const manualRow = logDialog.getByTestId(`row-invoice-inbox-log-run-${runManualFailedId}`);
      await expect(manualRow).toBeVisible();
      await expect(manualRow).toContainText("Handmatig door e2e-admin");
      await expect(manualRow).toContainText("ECONNREFUSED");

      await activeSwitch.click();
      await expect(activeSwitch).not.toBeChecked();
      await settle(page);
      await expect(logDialog.locator("tbody tr")).toHaveCount(3);
      await expect(logDialog.getByTestId(`row-invoice-inbox-log-run-${runSchedulerEmptyId}`)).toBeVisible();

      await page.screenshot({ path: path.join(shotsDir, "logboek-ophaalrondes.png") });
    });

    await watcher.check();
    const unexpected = watcher.violations.filter(
      (violation) => !(violation.kind === "console" && violation.detail === KNOWN_SETTINGS_DIALOG_TITLE_WARNING),
    );
    expect(
      unexpected,
      "page health, excluding the known Settings-dialog DialogTitle warning (task-7-report.md finding 1)",
    ).toEqual([]);
  });
});
