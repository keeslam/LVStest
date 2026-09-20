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
import type { Locator, Page } from "@playwright/test";
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

/**
 * Opens Settings -> tab E-mail -> Logboek, and returns the Logboek dialog's
 * own locator (matched by its DialogTitle, not DOM position, since the
 * Settings dialog underneath stays mounted and open the whole time). Shared by
 * both viewport describes below so the two only differ in what they assert
 * once the dialog is open.
 */
async function openInvoiceInboxLog(page: Page): Promise<Locator> {
  await page.goto("/");
  await settle(page);
  await page.getByTestId("user-menu-button").click();
  await page.getByTestId("menu-settings").click();
  const settingsDialog = page.locator('[role="dialog"], [role="alertdialog"]').last();
  await expect(settingsDialog).toBeVisible();
  // The trigger has no data-testid of its own (settings-panel.tsx); "E-mail &
  // GPS" is the full label shown at these viewport widths ("hidden
  // sm:inline"), unique among the tab strip's labels.
  await settingsDialog.getByRole("tab", { name: "E-mail & GPS", exact: true }).click();
  await settle(page);

  // InvoiceInboxConfigForm renders null until its config query resolves, and
  // the button sits at the bottom of the E-mail tab's card list.
  const openButton = page.getByTestId("button-invoice-inbox-log");
  await openButton.scrollIntoViewIfNeeded();
  await openButton.click();

  const logDialog = page.getByRole("dialog", { name: "Logboek" });
  await expect(logDialog).toBeVisible();
  await settle(page);
  return logDialog;
}

/** Filters out the one already-documented console violation so real ones still fail the test. */
function assertHealthy(watcher: Awaited<ReturnType<typeof watchPage>>) {
  const unexpected = watcher.violations.filter(
    (violation) => !(violation.kind === "console" && violation.detail === KNOWN_SETTINGS_DIALOG_TITLE_WARNING),
  );
  expect(
    unexpected,
    "page health, excluding the known Settings-dialog DialogTitle warning (task-7-report.md finding 1)",
  ).toEqual([]);
}

test.describe("Instellingen: Logboek van het factuurpostvak", () => {
  test.use({ storageState: authFile("admin") });

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

    // This is the one row with a stored attachment (attachment_path), so it is
    // also the one row whose "Acties" cell shows BOTH icon buttons at once
    // ("PDF openen" + "Naar controleren") — the layout-fix test below needs
    // that combination to check the actions column is actually wide enough.
    // The file need not exist on disk: `hasFile` in
    // server/services/invoice-inbox/inbox-storage.ts (toLogRow) is just
    // `Boolean(item.attachmentPath)`, and this test never clicks the link.
    const reviewPlateUnknown = await client.query<{ id: number }>(
      `INSERT INTO invoice_inbox_items
         (from_address, subject, attachment_name, attachment_path, attachment_hash, attachment_content_type, parsed, status, review_reason, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        "info@bandenhuisnoord.e2e.invalid",
        `${SUBJECT_PREFIX} Bandenhuis Noord factuur F-88213`,
        "bandenhuis-noord-f-88213.pdf",
        "invoice-inbox/2026/09/bandenhuis-noord-f-88213.pdf",
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
    if (!client) return; // beforeAll threw before the client connected — nothing to clean up.
    await client.query(`DELETE FROM invoice_inbox_items WHERE subject LIKE $1`, [`${SUBJECT_PREFIX}%`]);
    // Filtered, not asserted: a beforeAll that threw partway through (e.g. the
    // vehicle lookup) can leave a later run id as `undefined`, and
    // `= ANY($1::int[])` with a NULL element in the array matches nothing for
    // that element rather than deleting extra rows — but passing `undefined`
    // itself makes node-pg send SQL NULL, which is a wasted round trip at
    // best. Filtering first keeps this cleanup working for however far
    // beforeAll actually got, instead of throwing on top of its own failure.
    const runIds = [runSchedulerWithMailId, runSchedulerEmptyId, runManualFailedId].filter(
      (id): id is number => typeof id === "number",
    );
    if (runIds.length > 0) {
      await client.query(`DELETE FROM invoice_inbox_runs WHERE id = ANY($1::int[])`, [runIds]);
    }
    await client.end();
  });

  test.describe("op 1440x900", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("toont facturen, overige mail en ophaalrondes; zoeken en filters werken", async ({ page }) => {
      // watchPage(), not the `health` fixture: the Settings dialog's known,
      // already-documented DialogTitle warning (see the constant above) would
      // otherwise unconditionally fail `health`'s own teardown assertion.
      const watcher = await watchPage(page);

      const shotsDir = path.join(E2E.tmp, "shots");
      fs.mkdirSync(shotsDir, { recursive: true });

      const logDialog = await test.step("Logboek openen: tabblad Facturen toont de drie factuurregels, niet de twee overige-mailregels", async () => {
        const dialog = await openInvoiceInboxLog(page);

        await expect(dialog.getByTestId("tab-invoice-inbox-log-invoices")).toHaveAttribute("data-state", "active");
        await expect(dialog.locator("tbody tr")).toHaveCount(3);
        await expect(dialog.getByTestId(`row-invoice-inbox-log-${bookedId}`)).toBeVisible();
        await expect(dialog.getByTestId(`row-invoice-inbox-log-${reviewPlateUnknownId}`)).toBeVisible();
        await expect(dialog.getByTestId(`row-invoice-inbox-log-${reviewParseFailedId}`)).toBeVisible();
        await expect(dialog.getByTestId(`row-invoice-inbox-log-${otherNoAttachmentId}`)).toHaveCount(0);
        await expect(dialog.getByTestId(`row-invoice-inbox-log-${otherNotInvoiceId}`)).toHaveCount(0);
        // The booked row has no stored attachment (attachment_path is null),
        // so it must show no "PDF openen" action at all — only the Bandenhuis
        // row (below) has a file.
        await expect(dialog.getByTestId(`link-invoice-inbox-log-file-${bookedId}`)).toHaveCount(0);

        await page.screenshot({ path: path.join(shotsDir, "logboek-facturen.png") });
        return dialog;
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
      assertHealthy(watcher);
    });
  });

  test.describe("op 1280x800", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("elke kolom en actie blijft binnen de dialoog: geen horizontale scroll op geen van de drie tabbladen", async ({ page }) => {
      const watcher = await watchPage(page);
      const shotsDir = path.join(E2E.tmp, "shots");
      fs.mkdirSync(shotsDir, { recursive: true });

      const logDialog = await openInvoiceInboxLog(page);

      /** The table's own horizontal-scroll wrapper must not need to scroll. */
      const assertNoHorizontalOverflow = async (label: string) => {
        const scrollBox = logDialog.getByTestId("invoice-inbox-log-table-scroll");
        const { scrollWidth, clientWidth } = await scrollBox.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        expect(
          scrollWidth,
          `${label}: de tabel scrolt horizontaal (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`,
        ).toBeLessThanOrEqual(clientWidth);
      };

      /** The element's whole bounding box must sit inside the dialog's own bounding box. */
      const assertWithinDialog = async (target: Locator, label: string) => {
        const targetBox = await target.boundingBox();
        const dialogBox = await logDialog.boundingBox();
        expect(targetBox, `${label}: bounding box ontbreekt`).not.toBeNull();
        expect(dialogBox, "Logboek dialoog: bounding box ontbreekt").not.toBeNull();
        if (targetBox && dialogBox) {
          expect(targetBox.x, `${label}: linkerkant valt buiten de dialoog`).toBeGreaterThanOrEqual(dialogBox.x - 1);
          expect(
            targetBox.x + targetBox.width,
            `${label}: rechterkant valt buiten de dialoog`,
          ).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
        }
      };

      await test.step("Facturen: geen horizontale scroll; laatste kolomkop en bij de Bandenhuis-regel BEIDE acties blijven binnen de dialoog", async () => {
        await expect(logDialog.getByTestId("tab-invoice-inbox-log-invoices")).toHaveAttribute("data-state", "active");
        await assertNoHorizontalOverflow("Facturen");
        await assertWithinDialog(logDialog.locator("thead th").last(), "Facturen: laatste kolomkop");
        // The Bandenhuis row (reviewPlateUnknownId) is the one seeded row with
        // both a stored attachment and status "review", so its Acties cell is
        // the only one that ever renders both icon buttons side by side — the
        // exact case that needs the column to actually be wide enough.
        await assertWithinDialog(
          logDialog.getByTestId(`link-invoice-inbox-log-file-${reviewPlateUnknownId}`),
          "Facturen: actie 'PDF openen'",
        );
        await assertWithinDialog(
          logDialog.getByTestId(`link-invoice-inbox-log-review-${reviewPlateUnknownId}`),
          "Facturen: actie 'Naar controleren'",
        );
        await page.screenshot({ path: path.join(shotsDir, "logboek-facturen-1280.png") });
      });

      await test.step("Overige mail: geen horizontale scroll; laatste kolomkop blijft binnen de dialoog", async () => {
        await logDialog.getByTestId("tab-invoice-inbox-log-other").click();
        await settle(page);
        await assertNoHorizontalOverflow("Overige mail");
        await assertWithinDialog(logDialog.locator("thead th").last(), "Overige mail: laatste kolomkop");
        await page.screenshot({ path: path.join(shotsDir, "logboek-overige-mail-1280.png") });
      });

      await test.step("Ophaalrondes: geen horizontale scroll; laatste kolomkop blijft binnen de dialoog", async () => {
        await logDialog.getByTestId("tab-invoice-inbox-log-runs").click();
        await settle(page);
        await assertNoHorizontalOverflow("Ophaalrondes");
        await assertWithinDialog(logDialog.locator("thead th").last(), "Ophaalrondes: laatste kolomkop");
        await page.screenshot({ path: path.join(shotsDir, "logboek-ophaalrondes-1280.png") });
      });

      await watcher.check();
      assertHealthy(watcher);
    });
  });
});
