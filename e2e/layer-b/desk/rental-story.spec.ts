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
 *
 * Fix round 1 (task-8-report.md): server commit e19e786f fixed Finding A
 * (interactive damage checks always failing with 400 "Invalid damage check
 * data" — a JSON date string reaching a column that required a real `Date`).
 * That was the only thing blocking stage 4, so the story is one continuous
 * test again, as the brief intended — stages 1-6 in one `test`, one `page`,
 * carried straight through. Nothing about this fix touches the dialog-
 * stacking fault noted in stage 3 (the reopened reservation view can end up
 * stacked on top of the automatic handover dialog); that is unrelated to
 * Finding A and still applies at both pickup and return.
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { officeDay } from "../../seed/data";
import { E2E } from "../../support/env";

const CUSTOMER_NAME = "E2E Story Klant";

// Budgets are today's measured counts (Task 8 Step 3, re-measured in fix round 1
// now that stage 4 actually runs); Task 9 proposes lower ones.
const BUDGET = { customer: 7, reservation: 6, pickup: 4, damage: 3, return: 3 };
const VEHICLE_BUDGET = 5;

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
let diagramClient: pg.Client | undefined;
let diagramTemplateId: number | undefined;

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
  // Mirrors e2e/layer-b/settings/invoice-inbox-log.spec.ts: a beforeAll that
  // threw before `diagramClient` connected (or before the insert returned an
  // id) must not throw again on top of its own failure while cleaning up.
  if (!diagramClient) return;
  if (diagramTemplateId !== undefined) {
    // Stage 4 now actually saves a damage check, which references this
    // template by a real foreign key — clear that reference first (the
    // check row itself is the story's own artifact, not this seed's, so it
    // is left alone) or the delete below fails with "violates foreign key
    // constraint interactive_damage_checks_diagram_template_id_...".
    await diagramClient.query(
      `UPDATE interactive_damage_checks SET diagram_template_id = NULL WHERE diagram_template_id = $1`,
      [diagramTemplateId],
    );
    await diagramClient.query(`DELETE FROM vehicle_diagram_templates WHERE id = $1`, [diagramTemplateId]);
  }
  await diagramClient.end();
  // The image file lives under e2e/.tmp/, which is git-ignored and rebuilt
  // (via database.setup.ts's "from nothing" rebuild) on every full run.
});

test.describe("Balie: van telefoontje tot ingeleverde bus", () => {
  // Taller than Playwright's 720px default: the vehicle popover
  // (vehicle-selector.tsx) opens with `avoidCollisions={false}`, so Radix
  // never flips it above its trigger, and it is positioned `fixed` to the
  // viewport — scrolling the dialog cannot bring a clipped popover into view
  // (fix round 1: this made stage 2's vehicle pick flaky at the default
  // height, "element is outside of the viewport" even after Playwright's own
  // scroll). More vertical room is the honest fix; staff's own monitor is
  // whatever height it is, so this is a known gap between the test and them.
  test.use({ storageState: authFile("user"), viewport: { width: 1280, height: 1400 } });

  test("desk: from phone call to returned van", async ({ page, health, request }) => {
    test.setTimeout(180_000);
    // Captured once (stage 2, via the API — not by name: capitalizeName()
    // mangles it, see the finding below) and reused for the API-based
    // end-of-stage checks in stages 4 and 6.
    let reservationId: number;

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

      // Searched, not picked straight from the open list (fix round 1): the
      // "available vehicles" list this popover shows is whatever else is
      // true in the shared database at that instant, including vehicles
      // other tests are creating concurrently — with `avoidCollisions={false}`
      // on this Popover (vehicle-selector.tsx), an unsearched list long
      // enough to push E2E-08-H below the fold can render partly outside the
      // viewport instead of repositioning, which made this flaky. Typing the
      // plate keeps this to one, always-visible card regardless of how many
      // other vehicles exist at that moment.
      await story.click(dialog.getByRole("button", { name: /Zoek en selecteer een voertuig/ }), "voertuig zoeken openen");
      // Not scoped to `dialog`: Radix Popover portals its content straight
      // onto <body>, as a sibling of the dialog rather than a descendant.
      await story.fill(page.getByPlaceholder("Zoek op kenteken, merk of model..."), "E2E-08-H", "zoek E2E-08-H");
      // `.rounded-md.border` (not just `.cursor-pointer`): the calendar month
      // grid behind this dialog also uses `cursor-pointer` for its own day
      // cells and reservation bars, which would otherwise also match once a
      // reservation for this plate exists on screen.
      await story.click(page.locator("div.rounded-md.border.cursor-pointer", { hasText: "E2E08H" }), "voertuig E2E-08-H (Toyota Proace)");

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

      // Not counted (an API read, not a click): the reservation's id, for the
      // API-based end-of-stage checks later. E2E-08-H's only *other*
      // reservation is the seeded one already in status "returned"/
      // "completed" (e2e/seed/data.ts), so vehicle + an active status is
      // unambiguous — a name lookup is not, see the capitalizeName() finding
      // in stage 1.
      const vehicles = await (await request.get("/api/vehicles")).json();
      const van = vehicles.find((v: { licensePlate: string }) => v.licensePlate === "E2E-08-H");
      const reservations = await (await request.get("/api/reservations")).json();
      const ours = reservations.find(
        (r: { vehicleId: number; status: string }) => r.vehicleId === van.id && r.status === "booked",
      );
      expect(ours, "this story's reservation on E2E-08-H").toBeTruthy();
      reservationId = ours.id;
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
      // mileage to the vehicle's current mileage (5000 for E2E-08-H), and
      // fuel level defaults to "Vol".
      await expect(pickupDialog.locator("#pickupDate")).toHaveValue(officeDay(0));
      await expect(pickupDialog.getByTestId("input-pickup-mileage")).toHaveValue("5000");
      await expect(pickupDialog.getByTestId("select-fuel-level-pickup")).toHaveText("Vol");

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

    // Fix round 1: server commit e19e786f fixed Finding A (interactive
    // damage checks always 400ing — a JSON date string reaching a column
    // that required a real `Date`), so this stage runs for real now and the
    // story is one continuous test again. The reservation view dialog from
    // stage 3 is still open on top (see the stacking fault noted there), so
    // no navigation is needed to reach "Schadecheck aanmaken".
    await test.step("4. damage check at pickup (no damage)", async () => {
      const story = new Story("Schadecheck bij ophalen", BUDGET.damage);
      const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
      await expect(viewDialog).toBeVisible();
      await story.click(viewDialog.getByTestId("button-create-damage-check"), "Schadecheck aanmaken");

      const checkDialog = page.getByRole("dialog", { name: "Schadecheck" });
      await expect(checkDialog).toBeVisible();
      // Pre-fills staff rely on, not counted: vehicle, reservation and check
      // type (pickup) are already set from context; mileage and fuel level
      // are copied straight from the pickup just recorded.
      await expect(checkDialog.getByTestId("input-mileage")).toHaveValue("5000");
      await expect(checkDialog.getByTestId("select-fuel-level")).toHaveText("Vol");

      // "No damage" is the minimum the application requires to save: no
      // marker, no drawing and no signature is mandatory (handleSave only
      // requires a selected vehicle and a matched diagram template).
      await story.click(checkDialog.getByTestId("button-save-check"), "Schadecheck opslaan");
      // .first(): the toast text is duplicated into an aria-live announcer
      // region for screen readers, so an unscoped match is ambiguous.
      await expect(page.getByText("Schadecheck succesvol opgeslagen").first()).toBeVisible();
      // The dialog does not close itself after saving (by design, so staff
      // can still print) — it has to be left deliberately via Close.
      await story.click(checkDialog.getByTestId("button-close"), "Sluiten");
      story.finish();

      // End state via the API, not the screen: the check was actually
      // stored, for this reservation, dated today (office calendar, not
      // UTC) — the exact thing Finding A used to make impossible.
      const checks = await (await request.get(`/api/interactive-damage-checks/reservation/${reservationId}`)).json();
      const saved = checks.find((c: { checkType: string }) => c.checkType === "pickup");
      expect(saved, "stored pickup damage check for this reservation").toBeTruthy();
      expect(saved.mileage).toBe(5000);
      // checkDate now reads back as a real timestamp (server commit
      // e19e786f reads a bare day as 12:00 UTC), so slicing the ISO string
      // straight gives the office calendar day without a timezone dance.
      expect(new Date(saved.checkDate).toISOString().slice(0, 10)).toBe(officeDay(0));
    });

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
      await expect(returnDialog.getByTestId("select-fuel-level-return")).toHaveText("Vol");

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

      const after = await (await request.get(`/api/reservations/${reservationId}`)).json();
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
