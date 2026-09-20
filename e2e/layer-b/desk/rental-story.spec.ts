/**
 * The desk story, walked exactly as it works today: one customer, from phone
 * call to returned van, as the narrow desk profile (`user`) would really do
 * it — clicking through the same screens a member of staff sees, in the same
 * order. Nothing here is improved; Task 9 proposes the lower budgets and
 * fixes. Every deliberate action goes through `Story` so it is counted.
 *
 * besluiten.md B-02 (return auto-completes the rental) and B-16 (pickup
 * before the start date asks first) are exercised in edge-cases.spec.ts, not
 * here — this file only measures the flow that does not hit either edge.
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { officeDay } from "../../seed/data";
import { E2E } from "../../support/env";

const CUSTOMER_NAME = "E2E Story Klant";

// Budgets are today's measured counts (Task 8 Step 3); Task 9 proposes lower ones.
const BUDGET = { customer: 7, reservation: 4, pickup: 4, damage: 3, return: 3 };
const VEHICLE_BUDGET = 5;

/**
 * Finds this story's reservation via the API, in a way that survives the
 * capitalizeName() finding above (the stored customer name is "E2e Story
 * Klant", not "E2E Story Klant" — a case-sensitive `===` on the name would
 * silently find nothing). E2E-08-H's only *other* reservation is the seeded
 * one already in status "returned"/"completed" (see e2e/seed/data.ts), so
 * filtering by vehicle plate and an active status is unambiguous.
 */
async function findStoryReservation(request: APIRequestContext): Promise<{ id: number; status: string }> {
  const vehicles = await (await request.get("/api/vehicles")).json();
  const van = vehicles.find((v: { licensePlate: string }) => v.licensePlate === "E2E-08-H");
  const reservations = await (await request.get("/api/reservations")).json();
  const target = reservations.find(
    (r: { vehicleId: number; status: string }) => r.vehicleId === van.id && (r.status === "booked" || r.status === "picked_up"),
  );
  expect(target, "this story's reservation on E2E-08-H").toBeTruthy();
  return target;
}

/**
 * A fresh `lvs_e2e` has zero rows in `vehicle_diagram_templates` (the
 * database is built "from nothing", per database.setup.ts — no fixture data
 * beyond the explicit seed). Without at least one row, the interactive
 * damage check (client/src/pages/interactive-damage-check.tsx) can never
 * save a check for ANY vehicle: `fetchDiagram()` 404s on
 * `/api/vehicle-diagram-templates/match/:vehicleId`
 * (server/routes/vehicle-diagram-templates.ts), Chrome logs that 404 as a
 * console error regardless of how the page handles it (see guards.ts), and
 * the Save button stays disabled (`!diagramTemplate`). A real production
 * database already has at least one template — an admin uploads one once via
 * Documenten > schadecontrole-sjablonen-studio — so this is not a workflow or
 * business-behaviour change, only reference data every working deployment
 * already has. Finding for the owner: a brand-new installation cannot record
 * a single damage check until someone does that upload; nothing in the UI
 * says so (see task-8-report.md).
 */
let diagramClient: pg.Client;
let diagramTemplateId: number;

test.beforeAll(async () => {
  if (!E2E.databaseUrl.endsWith("/lvs_e2e")) {
    throw new Error(`Refusing to seed ${E2E.databaseUrl}; this spec only ever touches lvs_e2e.`);
  }
  diagramClient = new pg.Client({ connectionString: E2E.databaseUrl });
  await diagramClient.connect();

  const diagramsDir = path.join(E2E.uploadsDir, "vehicle-diagrams");
  fs.mkdirSync(diagramsDir, { recursive: true });
  const imageName = "e2e-story-diagram.png";
  // A minimal valid 1x1 transparent PNG — small enough to embed, still a real
  // image `<img>` can load and `drawImage()` can copy onto the save canvas.
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  fs.writeFileSync(path.join(diagramsDir, imageName), Buffer.from(pngBase64, "base64"));

  const inserted = await diagramClient.query<{ id: number }>(
    `INSERT INTO vehicle_diagram_templates (make, model, diagram_path, description, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    ["Toyota", "Proace", `vehicle-diagrams/${imageName}`, "E2E: generic diagram for the desk story (task-8)", "e2e-setup", "e2e-setup"],
  );
  diagramTemplateId = inserted.rows[0].id;
});

test.afterAll(async () => {
  await diagramClient.query(`DELETE FROM vehicle_diagram_templates WHERE id = $1`, [diagramTemplateId]);
  await diagramClient.end();
  // The image file lives under e2e/.tmp/, which is git-ignored and rebuilt
  // (via database.setup.ts's "from nothing" rebuild) on every full run.
});

test.describe("Balie: van telefoontje tot ingeleverde bus", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: authFile("user") });

  test("1-3. desk: van telefoontje tot opgehaald", async ({ page, health, request }) => {
    test.setTimeout(180_000);

    // The one free navigation (constraints.md): staff signs in and lands on
    // the dashboard. Every later move is a click through the app itself.
    await page.goto("/");
    await settle(page);

    await test.step("1. new customer", async () => {
      const story = new Story("Nieuwe klant", BUDGET.customer);
      await story.click(page.getByRole("link", { name: "Klanten" }), "Klanten");
      await settle(page);

      await story.click(page.getByTestId("button-add-customer"), "Klant toevoegen");
      const dialog = page.getByRole("dialog", { name: "Nieuwe klant toevoegen" });
      await expect(dialog).toBeVisible();

      await story.fill(dialog.getByLabel("Volledige naam"), CUSTOMER_NAME, "Volledige naam");
      // OBSERVATION (kind: required order did not match the work) — name
      // lives on the "Basisgegevens" tab, phone and e-mail on "Contact": a
      // member of staff always takes these three down together from one
      // phone call, but the form makes them switch tabs mid-entry to do it.
      await story.click(dialog.getByRole("tab", { name: "Contact", exact: true }), "tabblad Contact");
      await story.fill(dialog.getByLabel("Primair telefoonnummer"), "0612340099", "Telefoon");
      await story.fill(dialog.getByLabel("Primair e-mailadres"), "story.klant@e2e.invalid", "E-mail");

      await story.click(dialog.getByRole("button", { name: "Klant toevoegen" }), "Klant toevoegen (opslaan)");
      await settle(page);
      // OBSERVATION (kind: a default was wrong) — the name is silently
      // rewritten on save: capitalizeName() (client/src/lib/format-utils.ts)
      // title-cases every word, so the typed "E2E Story Klant" is stored as
      // "E2e Story Klant". `getByText` below still finds it (Playwright's
      // default text matching is case-insensitive), which is exactly why
      // this went unnoticed here — a case-sensitive lookup does not, as the
      // API-based lookups later in this file have to work around. The same
      // rule would mangle a real company name that intentionally has
      // internal capitals (an abbreviation, an initialism).
      await expect(page.getByText(CUSTOMER_NAME)).toBeVisible();
      story.finish();
    });

    await test.step("2. new reservation", async () => {
      const story = new Story("Nieuwe reservering", BUDGET.reservation);
      const row = page.locator("tr", { hasText: CUSTOMER_NAME });
      // The customer row itself offers "Nieuwe reservering" right next to the
      // customer staff just created — the logical next action IS offered
      // exactly where the previous one ended. (Kept as a plain comment, not a
      // finding: this is the one place the app gets this right.)
      await story.click(row.getByRole("button", { name: "Nieuwe reservering" }), "Nieuwe reservering");

      const dialog = page.getByRole("dialog", { name: "Nieuwe reservering" });
      await expect(dialog).toBeVisible();
      // Pre-fills staff rely on, not counted as actions: the customer is
      // already selected (the dialog was opened from their row), and the
      // period already defaults to today .. today+3 — exactly what this
      // story asks for — before anything is touched.
      // exact: true — "Huur zonder einddatum" (the open-ended checkbox label)
      // otherwise also matches "Einddatum" as a case-insensitive substring.
      await expect(dialog.getByLabel("Startdatum", { exact: true })).toHaveValue(officeDay(0));
      await expect(dialog.getByLabel("Einddatum", { exact: true })).toHaveValue(officeDay(3));

      const openVehicle = dialog.getByRole("button", { name: /Zoek en selecteer een voertuig/ });
      // Not scoped to `dialog`: Radix Popover portals its content straight
      // onto <body>, as a sibling of the dialog rather than a descendant.
      // `.rounded-md.border` (not just `.cursor-pointer`): the calendar month
      // grid behind this dialog also uses `cursor-pointer` for its own day
      // cells and reservation bars, which would otherwise also match once a
      // reservation for this plate exists on screen.
      const vehicleOption = page.locator("div.rounded-md.border.cursor-pointer", { hasText: "E2E08H" });
      await story.choose(openVehicle, vehicleOption, "voertuig E2E-08-H (Toyota Proace)");

      await story.click(dialog.getByTestId("button-submit-reservation"), "Reservering aanmaken");
      await settle(page);

      // No click path was offered back to the calendar from here (creating a
      // reservation from the customer list leaves staff on /customers, with
      // no on-screen link to "go see it"); the sidebar is the only way to
      // check the booking landed, so that is what this story uses.
      await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
      await settle(page);

      // A reservation spanning several days renders once on its pickup day
      // and once on its return day (calendar.tsx only draws a block on
      // isPickupDay || isReturnDay) — same reservation, two blocks, so
      // `.first()` is enough to prove it is on the calendar.
      const block = page.locator('[data-testid^="reservation-item-"]', { hasText: CUSTOMER_NAME }).first();
      await expect(block).toBeVisible();
      story.finish();
    });

    await test.step("3. pickup", async () => {
      const story = new Story("Ophalen", BUDGET.pickup);
      const block = page.locator('[data-testid^="reservation-item-"]', { hasText: CUSTOMER_NAME }).first();
      await story.click(block, "reservering openen");

      const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
      await expect(viewDialog).toBeVisible();
      await story.click(viewDialog.getByTestId("button-start-pickup-calendar"), "Ophalen starten");

      const pickupDialog = page.getByRole("dialog", { name: "Ophaalproces starten" });
      await expect(pickupDialog).toBeVisible();
      // Pre-fills staff rely on, not counted: pickup date defaults to today,
      // mileage to the vehicle's current mileage (5000 for E2E-08-H).
      await expect(pickupDialog.locator("#pickupDate")).toHaveValue(officeDay(0));
      await expect(pickupDialog.getByTestId("input-pickup-mileage")).toHaveValue("5000");

      // OBSERVATION (kind: a default was wrong) — the placeholder literally
      // says "Automatisch gegenereerd (bewerkbaar)" ("auto-generated,
      // editable"), but the field starts empty (useState("")) and nothing in
      // this component ever fills it in; the app clearly tracks contract
      // numbers already (it flags duplicates and "unusually high" ones live
      // as you type), yet never proposes the next one. Staff has to know and
      // type a number the application could reasonably have suggested.
      await story.fill(pickupDialog.getByTestId("input-contract-number"), "9000001", "Contractnummer");
      await story.click(pickupDialog.getByTestId("button-confirm-pickup"), "Ophalen voltooien & contract genereren");

      // A handover dialog appears automatically, offering to print or e-mail
      // the contract — staff did not ask for it (kind: a confirmation added
      // nothing). Here it reports failure: this database has no contract PDF
      // template configured (a fresh install has none, same story as the
      // vehicle diagram templates above), so "Contract klaar" never fires.
      //
      // FAULT (not a guard violation, a layout bug this test tripped over
      // directly): the reservation view dialog underneath reopens with fresh
      // data at the same moment this dialog opens, and — both being plain
      // z-50 Radix dialogs — the reopened view ends up stacked ON TOP,
      // covering this one entirely. Its own "Sluiten" button is still in the
      // DOM and Playwright reports it "visible, enabled and stable", but a
      // click on it hits the reservation view instead ("subtree intercepts
      // pointer events"). A member of staff would see the same thing: a
      // dialog they cannot click through to reach. Left open here rather
      // than worked around — the reservation view on top still has its own
      // "Schadecheck aanmaken" button, so the story continues from there.
      const handover = page.getByTestId("dialog-handover-result");
      await expect(handover).toBeVisible();
      await expect(handover.getByText("Contract kon niet gemaakt worden")).toBeVisible();
      story.finish();
    });

    expect(health.violations).toEqual([]);
  });

  // FAULT — stops the story here. FINDING FOR THE OWNER: saving ANY
  // interactive damage check always fails with 400 "Invalid damage check
  // data" / field checkDate: "Expected date, received string". Reproduce: on
  // any reservation, pickup or return, click "+ Schadecheck aanmaken" (or the
  // pickup/return dialog's own "Ophaal-schadecheck aanmaken"), fill nothing
  // else, click "Schadecheck opslaan" -> red toast "Fout: Invalid damage
  // check data", browser console "Failed to load resource: the server
  // responded with a status of 400". Root cause: interactive-damage-check.tsx
  // handleSave() sends `checkDate: new Date().toISOString().split('T')[0]`,
  // a plain "yyyy-MM-dd" string (JSON has no Date type); shared/schema.ts's
  // insertInteractiveDamageCheckSchema is drizzle-zod's default over a
  // `timestamp` column, which requires an actual JS `Date`; and
  // server/middleware/validateBody.ts's coerceBodyForTable only coerces
  // number/boolean/PgNumeric columns, never a date/timestamp one. This
  // reproduces for every vehicle, every reservation, every check type — not
  // specific to this story's data. Left in place, not fixed (constraints.md);
  // the body below is what the story would do once this is fixed.
  test.fixme(
    "4. desk: schadecheck bij ophalen (geen schade) — geblokkeerd door een 400 op elke poging",
    async ({ page, health, request }) => {
      const target = await findStoryReservation(request);

      await page.goto("/");
      await settle(page);
      await page.getByRole("link", { name: "Reserveringen" }).click();
      await settle(page);
      await page.getByTestId("button-list-view").click();
      await page.getByTestId(`view-btn-${target.id}`).click();

      const story = new Story("Schadecheck bij ophalen", BUDGET.damage);
      const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
      await expect(viewDialog).toBeVisible();
      await story.click(viewDialog.getByTestId("button-create-damage-check"), "Schadecheck aanmaken");

      const checkDialog = page.getByRole("dialog", { name: "Schadecheck" });
      await expect(checkDialog).toBeVisible();
      await expect(checkDialog.getByTestId("input-mileage")).toHaveValue("5000");

      await story.click(checkDialog.getByTestId("button-save-check"), "Schadecheck opslaan");
      await expect(page.getByText("Schadecheck succesvol opgeslagen")).toBeVisible();
      await story.click(checkDialog.getByTestId("button-close"), "Sluiten");
      story.finish();

      expect(health.violations).toEqual([]);
    },
  );

  // Continues from "1-3" above via the API (not via `page`, which a fresh
  // test does not carry over) rather than depending on the damage check that
  // "4." could not create — the return flow needs none.
  test("5-6. desk: inleveren en eindstatus", async ({ page, health, request }) => {
    const target = await findStoryReservation(request);
    expect(target.status).toBe("picked_up");

    await page.goto("/");
    await settle(page);
    await page.getByRole("link", { name: "Reserveringen" }).click();
    await settle(page);
    // No click path was offered back to this specific reservation from the
    // dashboard (kind: the logical next action was not offered) — staff has
    // to know to open the list view and search/scroll for it, same as
    // anyone locating a reservation days after picking it up.
    await page.getByTestId("button-list-view").click();
    const listDialog = page.getByTestId("dialog-reservation-list");
    await expect(listDialog).toBeVisible();
    await listDialog.getByTestId(`view-btn-${target.id}`).click();

    await test.step("5. return", async () => {
      const story = new Story("Inleveren", BUDGET.return);
      const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
      await expect(viewDialog).toBeVisible();
      await story.click(viewDialog.getByTestId("button-start-return-calendar"), "Inleveren starten");

      const returnDialog = page.getByRole("dialog", { name: "Inleverproces starten" });
      await expect(returnDialog).toBeVisible();
      // Pre-fills staff rely on, not counted: return date defaults to today,
      // mileage defaults to the pickup mileage (5000), and fuel level
      // defaults to "Vol" — exactly what this story needs, so fuel is never
      // touched below.
      await expect(returnDialog.locator("#returnDate")).toHaveValue(officeDay(0));
      await expect(returnDialog.getByTestId("input-return-mileage")).toHaveValue("5000");

      await story.fill(returnDialog.getByTestId("input-return-mileage"), "5350", "Kilometerstand bij inleveren");
      await story.click(returnDialog.getByTestId("button-confirm-return"), "Inleveren voltooien & schadecheck genereren");

      // Same interruption and the same stacking fault as at pickup (see the
      // comment in stage 3): the reopened reservation view ends up on top,
      // burying this dialog. Unlike the pickup's contract, this one succeeds
      // — "Schadeformulier klaar", with the PDF already visible under
      // "Geüpload" behind it — because a damage-check PDF has a built-in
      // fallback (getDefaultDamageCheckTemplate(), server/routes.ts) that
      // the contract PDF path has no equivalent of. Left open for the same
      // reason as at pickup: the reservation view on top is still usable,
      // and nothing later in this story needs this dialog closed.
      const handover = page.getByTestId("dialog-handover-result");
      await expect(handover).toBeVisible();
      await expect(handover.getByText("Schadeformulier klaar")).toBeVisible();
      story.finish();
    });

    await test.step("6. end state", async () => {
      const vehicles = await (await request.get("/api/vehicles")).json();
      const van = vehicles.find((v: { licensePlate: string }) => v.licensePlate === "E2E-08-H");
      expect(van.currentMileage).toBe(5350);
      // B-02 — the return auto-completed the rental; there is no separate
      // "mark completed" step for staff to remember.
      expect(van.availabilityStatus).toBe("available");

      const after = await (await request.get(`/api/reservations/${target.id}`)).json();
      expect(after.status).toBe("completed");
      expect(after.returnMileage).toBe(5350);
    });

    expect(health.violations).toEqual([]);
  });
});

// `e2e-user` lacks MANAGE_VEHICLES, so the story above rents a seeded
// vehicle rather than creating one. Creating a vehicle is a maintenance-role
// task, walked here as its own short story with its own budget.
test.describe("Voertuigbeheer: nieuw voertuig via kenteken-opzoeking", () => {
  test.use({ storageState: authFile("maintenance") });

  test("maintenance: new vehicle via RDW lookup", async ({ page, health }) => {
    await page.goto("/");
    await settle(page);

    const story = new Story("Voertuig toevoegen", VEHICLE_BUDGET);
    await story.click(page.getByRole("link", { name: "Voertuigen" }), "Voertuigen");
    await settle(page);

    await story.click(page.getByTestId("button-add-vehicle"), "Voertuig toevoegen");
    const dialog = page.getByRole("dialog", { name: "Nieuw voertuig toevoegen" });
    await expect(dialog).toBeVisible();

    await story.fill(dialog.getByTestId("input-vehicle-license-plate"), "E2E-99-Z", "Kenteken");
    await story.click(dialog.getByTestId("button-lookup"), "Opzoeken");
    // The RDW stub (e2e/support/rdw-stub.ts) answers any 6-character plate
    // not starting with "ZZ" as a white Volkswagen Crafter — not counted,
    // this is what the lookup itself fills in, not a user action.
    //
    // OBSERVATION (kind: a default was wrong) — typing a brand/model by hand
    // runs it through capitalizeWords() (see customer-form.tsx/vehicle-form.tsx
    // onChange), but the RDW lookup writes the raw RDW value straight into the
    // form via form.setValue(), bypassing that same normalisation. Every
    // vehicle added this way ends up named "VOLKSWAGEN" / "CRAFTER" in full
    // caps, unlike every seeded vehicle ("Volkswagen", "Crafter") and unlike
    // what a manually-typed brand would look like.
    await expect(dialog.getByTestId("input-vehicle-brand")).toHaveValue("VOLKSWAGEN");
    await expect(dialog.getByTestId("input-vehicle-model")).toHaveValue("CRAFTER");

    await story.click(dialog.getByTestId("button-submit-vehicle"), "Opslaan");
    await settle(page);
    // The vehicles page renders both a table and a card view (responsive
    // layouts) at once, so the plate appears twice in the DOM — .first() is
    // enough to prove it landed.
    await expect(page.getByText("E2E99Z").first()).toBeVisible();
    story.finish();

    expect(health.violations).toEqual([]);
  });
});
