/**
 * Audit remediation P11 (Documenten; docs/audit/fysieke-e2e-audit-2026-10-09.md, module 10 and 11) -
 * the library walked as a member of the office, in a real browser:
 *
 *   A-10-5  generated documents show their type and note in Dutch
 *   A-10-8  a vehicle is found by its plate typed without dashes, and the hit is opened
 *   A-10-4  "Bekijken" opens a preview that Escape closes, and "Document uploaden" opens right after
 *   A-10-9  the upload form follows the vehicle choice directly: no second button, no second dialog
 *   A-10-2  the contract editor refuses "Als standaard instellen" for a template without fields
 *   A-10-3  Escape on an editor with unsaved changes asks first; after saving it just closes
 *   A-11-1  the server refuses a vehicle diagram that is a 1198 x 24 strip (and says why, by code)
 *
 * The one destructive toast of this story ("zonder velden kan niet het standaardsjabloon zijn") is
 * the point of A-10-2; it is consumed from the page-health violations by its exact text instead of
 * loosening the guard.
 *
 * Rows this story writes (two documents, one template) are removed again in `lvs_e2e` only. The
 * seeded default template ("E2E contract") is never touched: the desk story needs it.
 *
 * Account: `admin-b`, the twin of `admin` (own request bucket; the desk story and the matrix lean on
 * `admin`). Cost, measured 10 Oct 2026: see the number in the budget line below.
 */
import pg from "pg";
import { createCanvas } from "canvas";
import { test, expect, settle, type Violation } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { E2E } from "../../support/env";

test.use({ storageState: authFile("admin-b"), viewport: { width: 1280, height: 1400 } });

const NOTE_PREFIX = "E2E-P11";
const TEMPLATE_NAME = "E2E-P11 sjabloon";
// The note the damage check generator writes; it is exact on purpose (the library translates it), so
// it carries no prefix and is removed by its text.
const GENERATED_NOTE = "Damage check recorded at return of reservation #3200";

function consumeExpected(health: { violations: Violation[] }, kind: Violation["kind"], pattern: RegExp) {
  const index = health.violations.findIndex((v) => v.kind === kind && pattern.test(v.detail));
  expect(index, `expected a "${kind}" violation matching ${pattern}`).toBeGreaterThanOrEqual(0);
  health.violations.splice(index, 1);
}

async function removeRows() {
  if (!E2E.databaseUrl.endsWith("/lvs_e2e")) throw new Error(`Refusing to touch ${E2E.databaseUrl}; this spec only ever touches lvs_e2e.`);
  const client = new pg.Client({ connectionString: E2E.databaseUrl });
  await client.connect();
  try {
    await client.query(`DELETE FROM documents WHERE notes LIKE $1 OR notes = $2`, [`${NOTE_PREFIX}%`, GENERATED_NOTE]);
    await client.query(`DELETE FROM pdf_templates WHERE name = $1`, [TEMPLATE_NAME]);
    await client.query(`DELETE FROM vehicle_diagram_templates WHERE make LIKE $1`, [`${NOTE_PREFIX}%`]);
  } finally {
    await client.end();
  }
}

test.beforeAll(removeRows);
test.afterAll(removeRows);

function png(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#cccccc";
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

test("documenten: Nederlandse labels, zoeken op kenteken, voorbeeld sluiten, uploaden, sjabloon-editor", async ({ page, context, health }) => {
  test.setTimeout(180_000);
  const story = new Story("Documenten: zoeken, bekijken, uploaden, sjabloon bewerken", 25);
  // Request cost of this account, for the budget rule in docs/e2e/README.md: everything the page asks for
  // plus the four direct API calls of the setup below (all of it counts against admin-b's 1000 per window).
  let apiRequests = 4;
  page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/") && path !== "/api/user") apiRequests += 1; });

  // Setup, not counted: two documents the way the generators write them, and the diagram refusal.
  await page.goto("/documents");
  await settle(page);
  const csrf = (await context.cookies()).find((c) => c.name === "XSRF-TOKEN")?.value ?? "";
  const vehicles: Array<{ id: number; licensePlate: string; brand: string; model: string }> = await (await page.request.get("/api/vehicles")).json();
  const vehicleA = vehicles.find((v) => v.licensePlate === "E2E-04-D")!;
  const vehicleB = vehicles.find((v) => v.licensePlate === "E2E-01-A")!;
  expect(vehicleA && vehicleB).toBeTruthy();
  const upload = (vehicleId: number, documentType: string, notes: string, name: string) =>
    page.request.post("/api/documents", {
      headers: { "X-CSRF-Token": csrf },
      multipart: { vehicleId: String(vehicleId), documentType, notes, file: { name, mimeType: "application/pdf", buffer: PDF } },
    });
  expect((await upload(vehicleA.id, "Damage Check", GENERATED_NOTE, "e2e-p11-a.pdf")).status()).toBe(201);
  expect((await upload(vehicleB.id, "Insurance", `${NOTE_PREFIX} polis`, "e2e-p11-b.pdf")).status()).toBe(201);

  // A-11-1, at the real server: a strip is refused with a code, a normal picture is not tried here.
  const strip = await page.request.post("/api/vehicle-diagram-templates", {
    headers: { "X-CSRF-Token": csrf },
    multipart: { make: `${NOTE_PREFIX}-strip`, model: "Strip", diagram: { name: "strip.png", mimeType: "image/png", buffer: png(1198, 24) } },
  });
  expect(strip.status()).toBe(400);
  expect((await strip.json()).code).toBe("DIAGRAM_IMAGE_TOO_FLAT");

  await page.reload();
  await settle(page);

  // A-10-8: typed without dashes, in lower case; the matching vehicle is opened.
  await story.fill(page.getByPlaceholder("Documenten zoeken..."), "e2e04d", "zoeken op kenteken");
  const groupA = page.getByRole("heading", { level: 3 }).filter({ hasText: "Renault Master" });
  await expect(groupA).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 3 }).filter({ hasText: "Volkswagen Crafter" })).toHaveCount(0);
  // A-10-5: the generated type and note are Dutch; the stored English is not shown.
  await expect(page.getByRole("heading", { level: 4, name: /^Schadecheck/ })).toBeVisible();
  await expect(page.getByText("Schadecheck vastgelegd bij het inleveren van reservering #3200")).toBeVisible();
  await expect(page.getByText("Damage check recorded at return")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 4, name: "Damage Check" })).toHaveCount(0);

  // A-10-4: view, Escape, and the upload button works right away.
  const viewButton = page.locator('[data-testid^="button-view-document-"]').first();
  await story.click(viewButton, "Bekijken");
  const preview = page.getByTestId("dialog-document-preview");
  await expect(preview).toBeVisible();
  // The PDF viewer takes the keyboard focus when it has loaded; the page hands it back to the dialog,
  // which is what lets Escape reach it (a few hundred milliseconds after the preview opened).
  await expect(preview).toBeFocused({ timeout: 5_000 });
  await story.press(page, "Escape", "voorbeeld sluiten");
  await expect(preview).toHaveCount(0);

  await story.click(page.getByTestId("button-upload-document"), "Document uploaden");
  const uploadDialog = page.getByTestId("dialog-upload-document");
  await expect(uploadDialog).toBeVisible();

  // A-10-9: choosing the vehicle shows the form itself - type, file, notes - in the same dialog.
  await story.click(page.getByTestId("select-upload-vehicle"), "voertuig kiezen");
  await story.click(page.locator("div.cursor-pointer").filter({ hasText: "Renault Master" }).first(), "Renault Master");
  const form = uploadDialog.getByTestId("inline-document-upload");
  await expect(form).toBeVisible();
  await expect(form.getByRole("button", { name: "Document uploaden" })).toBeDisabled();
  await story.choose(form.getByRole("combobox"), page.getByRole("option", { name: "Verzekering" }), "type Verzekering");
  await story.upload(form.locator('input[type="file"]'), { name: "e2e-p11-c.pdf", mimeType: "application/pdf", buffer: PDF }, "e2e-p11-c.pdf");
  await story.fill(form.getByPlaceholder("Eventuele aanvullende notities over dit document"), `${NOTE_PREFIX} upload`, "notitie");
  await story.click(form.getByRole("button", { name: "Document uploaden" }), "uploaden");
  await expect(uploadDialog).toHaveCount(0);
  // The new document is in the list under its Dutch type (the server renames the file, so look at the type).
  await expect(page.getByRole("heading", { level: 4, name: "Verzekering" })).toBeVisible();

  // The contract editor.
  await story.click(page.getByTestId("tab-contract-templates"), "tabblad Contractsjablonen");
  await story.click(page.getByTestId("button-open-template-editor"), "sjablooneditor openen");
  const editor = page.getByRole("dialog");
  await expect(editor.getByTestId("button-save-template")).toBeVisible();
  // A new template starts empty and is not the default (a default already exists).
  await story.click(editor.getByTestId("button-new-template"), "nieuw sjabloon");
  await story.fill(page.getByTestId("input-new-template-name"), TEMPLATE_NAME, "naam");
  await story.click(page.getByTestId("button-create-template-confirm"), "sjabloon maken");
  await expect(editor.getByRole("combobox").first()).toBeVisible();
  await story.choose(editor.getByRole("combobox").first(), page.getByRole("option", { name: TEMPLATE_NAME }), "sjabloon kiezen");

  // A-10-2: "Als standaard instellen" is refused before the server is asked.
  await story.click(editor.getByRole("button", { name: "Als standaard instellen" }), "Als standaard instellen");
  await expect(page.locator("li.destructive").filter({ hasText: "zonder velden kan niet het standaardsjabloon zijn" })).toBeVisible();
  consumeExpected(health, "toast", /zonder velden kan niet het standaardsjabloon zijn/);

  // A-10-3: a new field is an unsaved change; Escape asks, "Verder bewerken" keeps it, Save clears it.
  await story.click(editor.getByTestId("button-add-field"), "Veld toevoegen");
  await story.fill(page.getByTestId("input-field-name"), "Kenteken", "veldnaam");
  await story.choose(page.getByTestId("select-field-source"), page.getByRole("option", { name: "Kenteken" }), "gegevensbron Kenteken");
  await story.click(page.getByTestId("button-add-field-confirm"), "veld toevoegen bevestigen");
  await expect(editor.getByTestId("template-editor-save-status")).toContainText("niet-opgeslagen wijzigingen");
  // The "add field" dialog is gone and Radix has handed the focus back to its button; an Escape pressed
  // while that layer is still closing would be swallowed by it.
  await expect(page.getByTestId("input-field-name")).toHaveCount(0);
  await expect(editor.getByTestId("button-add-field")).toBeFocused();
  // A visible toast is a Radix layer of its own: the first Escape closes the toast, not the dialog behind
  // it (this is also why Escape seemed to be ignored right after "Opslaan" in the audit). Let it go first.
  await expect(page.locator('li[data-state]')).toHaveCount(0, { timeout: 10_000 });

  // Radix needs a moment after a nested dialog closed before the layer below answers Escape again (a
  // person never presses it that fast; a script does).
  await page.waitForTimeout(600);
  await story.press(page, "Escape", "editor sluiten met wijzigingen");
  const discard = page.getByRole("alertdialog");
  await expect(discard).toContainText("Wijzigingen niet opgeslagen");
  await story.click(discard.getByRole("button", { name: "Verder bewerken" }), "Verder bewerken");
  await expect(editor.getByTestId("button-save-template")).toBeVisible();

  await story.click(editor.getByTestId("button-save-template"), "Opslaan");
  await expect(editor.getByTestId("template-editor-save-status")).toContainText("Alle wijzigingen zijn opgeslagen", { timeout: 15_000 });
  await expect(page.locator('li[data-state]')).toHaveCount(0, { timeout: 10_000 });
  await story.press(page, "Escape", "editor sluiten zonder wijzigingen");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  console.log(`[verzoeken] documenten-verhaal (admin-b): ${apiRequests} API-verzoeken`);
  story.finish();
});
