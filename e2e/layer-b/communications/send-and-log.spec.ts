/**
 * Audit remediation P3 (Communicatie; docs/audit/fysieke-e2e-audit-2026-10-09.md, module 13) - the
 * story the audit walked by hand, as `manager-b`:
 *
 *   A message to one customer cannot be mailed (the E2E server has no e-mail configuration and
 *   nothing leaves the machine). Before P3 the page answered "Meldingen succesvol verstuurd - 0
 *   e-mails verstuurd, 1 mislukt" and emptied the form; now it says nothing was sent, keeps the
 *   recipients, and the E-maillogboek shows the reason in Dutch and opens a row (the dialog
 *   `email-log-detail-dialog.tsx`, which this story is the registry's proof for).
 *
 * The preview is checked on the way: it shows the mail as THIS customer gets it (name and plate
 * filled in, double braces too), not the template with its placeholders.
 *
 * The one destructive toast ("Er is niets verstuurd") is the point of the story; it is consumed
 * from the page-health violations by its exact text instead of loosening the guard.
 *
 * Account: `manager-b`, the twin of `manager` (own request bucket; it holds both
 * manage_notifications and manage_email_templates, which `notifications-only` and
 * `templates-only` do not). Cost, measured 10 Oct 2026: 19 `/api/` requests for the whole story
 * (page load, the lists behind the three tabs, the send, the log read again).
 */
import pg from "pg";
import { test, expect, settle, type Violation } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { E2E } from "../../support/env";

test.use({ storageState: authFile("manager-b"), viewport: { width: 1280, height: 1400 } });

const SUBJECT_PREFIX = "E2E-P3";

function consumeExpected(health: { violations: Violation[] }, kind: Violation["kind"], pattern: RegExp) {
  const index = health.violations.findIndex((v) => v.kind === kind && pattern.test(v.detail));
  expect(index, `expected a "${kind}" violation matching ${pattern}`).toBeGreaterThanOrEqual(0);
  health.violations.splice(index, 1);
}

async function removeLogRows() {
  if (!E2E.databaseUrl.endsWith("/lvs_e2e")) throw new Error(`Refusing to touch ${E2E.databaseUrl}; this spec only ever touches lvs_e2e.`);
  const client = new pg.Client({ connectionString: E2E.databaseUrl });
  await client.connect();
  try {
    await client.query(`DELETE FROM email_logs WHERE subject LIKE $1`, [`${SUBJECT_PREFIX}%`]);
  } finally {
    await client.end();
  }
}

test.beforeAll(removeLogRows);
test.afterAll(removeLogRows);

test("een bericht dat niet aankomt: eerlijke melding, ontvangers blijven staan, het logboek legt het uit en opent de regel", async ({ page, health }) => {
  test.setTimeout(120_000);
  const story = new Story("Bericht versturen dat niet aankomt, logboek openen", 9);

  await page.goto("/communications");
  await settle(page);

  await story.click(page.getByTestId("tab-custom"), "tabblad Aangepast bericht");
  const customer = page.locator('[data-testid^="customer-card-"]').filter({ hasText: "E2E Pieter Bakker" });
  await expect(customer).toHaveCount(1);
  await story.click(customer, "klant E2E Pieter Bakker");
  await story.fill(page.getByTestId("input-custom-subject"), `${SUBJECT_PREFIX} nieuws voor {customerName}`, "onderwerp");
  await story.fill(page.getByTestId("textarea-custom-message"), "Beste {customerName} en {{customerName}}, uw {vehiclePlate} staat klaar.", "bericht");
  await story.click(page.getByTestId("button-preview-custom"), "Voorvertonen & versturen");

  // The preview is the mail this customer gets.
  const preview = page.getByRole("dialog");
  await expect(preview.getByTestId("preview-subject")).toHaveText(`${SUBJECT_PREFIX} nieuws voor E2E Pieter Bakker`);
  await expect(preview.getByTestId("preview-content")).toHaveText("Beste E2E Pieter Bakker en E2E Pieter Bakker, uw staat klaar.");
  await expect(preview.getByTestId("preview-empty-note")).toContainText("Kenteken");
  await expect(preview).toContainText("bakker@e2e.invalid");

  await story.click(preview.getByTestId("button-confirm-send-notifications"), "Bevestigen & e-mails versturen");

  // The send comes back 200 with 0 sent: the page says so, and keeps what was typed.
  const toast = page.locator("li.destructive").filter({ hasText: "Er is niets verstuurd" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("1 e-mail mislukt");
  await expect(toast).not.toContainText("succesvol");
  await expect(page.getByText("1 klant geselecteerd")).toBeVisible();
  await expect(page.getByTestId("input-custom-subject")).toHaveValue(`${SUBJECT_PREFIX} nieuws voor {customerName}`);
  consumeExpected(health, "toast", /Er is niets verstuurd/);

  // The log explains it, in Dutch, with the stored text as detail.
  await story.click(page.getByRole("tab", { name: "E-maillogboek" }), "tabblad E-maillogboek");
  // The run's summary row names the address in its technical detail too; only the row of the
  // mail itself says "Aan: <address>".
  const row = page.getByTestId("email-log-row").filter({ hasText: /Aan:\s*bakker@e2e\.invalid/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Aangepast bericht");
  await expect(row).toContainText("Er is geen werkende e-mailconfiguratie");
  await expect(row.getByTestId("email-log-raw")).toContainText("NO_EMAIL_CONFIG: No valid email configuration for purpose: custom");

  await story.click(row.locator('[data-testid^="button-email-log-detail-"]'), "Details van de regel");
  const detail = page.getByTestId("dialog-email-log-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("email-log-detail-recipient")).toHaveText("bakker@e2e.invalid");
  await expect(detail.getByTestId("email-log-detail-status")).toHaveText("mislukt");
  await expect(detail.getByTestId("email-log-detail-body-note")).toContainText("niet bewaard");
  await story.click(detail.getByTestId("button-email-log-detail-close"), "Sluiten");
  await expect(detail).toBeHidden();

  story.finish();
});
