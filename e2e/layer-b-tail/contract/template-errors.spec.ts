/**
 * B-34 (task 6) — the E2E seed's one PDF template ("E2E contract",
 * e2e/seed/data.ts) proves the happy path everywhere else in the suite: a
 * pickup with a real, fielded default template produces an actual contract.
 * This spec proves the *other* outcome that hides behind it: a template
 * marked default but with zero fields must refuse cleanly — 409
 * TEMPLATE_WITHOUT_FIELDS (server/services/pdf-template-selection.ts
 * `withFields()`, BUG-028) — and the failure dialog must show *this* task's
 * own Dutch sentence, translated by the stable `code`, never the server's
 * English message.
 *
 * Runs in `layer-b-tail` (e2e/playwright.config.ts, project added by Task 2),
 * after layer-a and layer-b: it mutates a shared, singleton fact for the
 * whole database — which pdf template is "the" default — and every other
 * spec in the suite that generates a contract (the desk story among them)
 * relies on "E2E contract" being that default throughout its own run. Doing
 * this concurrently with them would make some other worker's pickup
 * non-deterministically pick up this spec's fieldless template instead.
 * `mode: "serial"` on top guards this file's own three steps (create the
 * fieldless template as default, prove the error, restore the seeded
 * template as default) against ever interleaving with a second spec added to
 * this same file later.
 */
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { officeDay } from "../../seed/data";

test.describe.configure({ mode: "serial" });

// Seed customer/vehicle (e2e/seed/data.ts, customer index 4 / vehicle index
// 5) — both otherwise untouched by any other spec: the customer is never
// searched for by any other file, and the vehicle's only seeded reservation
// ("completed", ended 25 days ago) is long closed, so it is free for a fresh
// booking here.
const CUSTOMER_EMAIL = "visser@e2e.invalid";
const CUSTOMER_NAME = "E2E Garage Visser";
const VEHICLE_PLATE = "E2E-06-F";
const SEEDED_TEMPLATE_NAME = "E2E contract";
const FIELDLESS_TEMPLATE_NAME = "E2E TEMPLATE_WITHOUT_FIELDS (tail spec)";

// Measured for this spec: open the reservation, start the pickup, fill the
// contract number, confirm.
const BUDGET = { pickup: 4 };

test.describe("Contract: een standaardsjabloon zonder velden geeft een duidelijke Nederlandse fout (B-34)", () => {
  // Same tall viewport as the other layer-b-tail spec and the desk stories:
  // the vehicle popover (vehicle-selector.tsx) is `fixed` and
  // `avoidCollisions={false}`, so it needs the extra room even though this
  // spec never opens it (kept for consistency, harmless if unused).
  //
  // Role: `manager`, not the `admin` the brief names. Same reasoning as
  // e2e/layer-b-tail/reservations/past-reservation.spec.ts (Task 2): by the
  // time `layer-b-tail` starts, `admin`'s apiLimiter window (server/
  // middleware/security/rateLimiter.ts, shared for the whole run, one server
  // process) is the most exhausted of the ten seeded accounts — `admin` is
  // what layer-a's dialogs.spec.ts/forbidden.spec.ts hammer on every registry
  // entry. `manager` holds every permission this spec needs
  // (MANAGE_PDF_TEMPLATES, MANAGE_RESERVATIONS, VIEW_RESERVATIONS) and is a
  // different, unexhausted bucket.
  test.use({ storageState: authFile("manager"), viewport: { width: 1280, height: 1400 } });

  let seededTemplateId: number;
  let fieldlessTemplateId: number;

  test("een sjabloon zonder velden geeft de TEMPLATE_WITHOUT_FIELDS-tekst, niet een leeg contract", async ({ page, health, request }) => {
    test.setTimeout(60_000);

    // The double-submit CSRF cookie the app's own client reads and echoes
    // back on every mutating request (server/middleware/security/csrf.ts) —
    // same pattern as the other layer-b-tail spec: read once from the
    // context `storageState` populated, cookies already present before any
    // navigation.
    const cookies = await page.context().cookies();
    const csrfToken = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
    expect(csrfToken, "XSRF-TOKEN cookie from storageState").toBeTruthy();

    let reservationId: number;

    await test.step("0. seed setup: find the seeded default template and a fresh reservation to pick up (via the API, not counted)", async () => {
      const templates = await (await request.get("/api/pdf-templates")).json();
      const seeded = templates.find((t: { name: string }) => t.name === SEEDED_TEMPLATE_NAME);
      expect(seeded, `seeded default template "${SEEDED_TEMPLATE_NAME}"`).toBeTruthy();
      expect(seeded.isDefault).toBe(true);
      seededTemplateId = seeded.id;

      const vehicles = await (await request.get("/api/vehicles")).json();
      const vehicle = vehicles.find((v: { licensePlate: string }) => v.licensePlate === VEHICLE_PLATE);
      expect(vehicle, `seeded vehicle ${VEHICLE_PLATE}`).toBeTruthy();

      const customers = await (await request.get("/api/customers")).json();
      const customer = customers.find((c: { email: string }) => c.email === CUSTOMER_EMAIL);
      expect(customer, `seeded customer ${CUSTOMER_EMAIL}`).toBeTruthy();

      const created = await request.post("/api/reservations", {
        headers: { "X-CSRF-Token": csrfToken! },
        data: {
          customerId: customer.id,
          vehicleId: vehicle.id,
          startDate: officeDay(0),
          endDate: officeDay(3),
          type: "standard",
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      reservationId = (await created.json()).id;
    });

    await test.step("1. via the API: a second template, no fields, marked default", async () => {
      const createdTemplate = await request.post("/api/pdf-templates", {
        headers: { "X-CSRF-Token": csrfToken! },
        data: { name: FIELDLESS_TEMPLATE_NAME, isDefault: true, fields: [] },
      });
      expect(createdTemplate.status(), await createdTemplate.text()).toBe(201);
      // Note: POST's own response body has a pre-existing, unrelated bug
      // (server/database-storage.ts createPdfTemplate() returns the raw
      // `RETURNING *` row uncast to camelCase, so `isDefault` reads back as
      // `undefined` here even though the row itself is correct) — confirmed
      // properly below via GET, which does map it.
      fieldlessTemplateId = (await createdTemplate.json()).id;

      // createPdfTemplate() un-defaults every other row itself
      // (server/database-storage.ts) — confirm the seeded template really
      // lost it, or step 2 below would be proving nothing.
      const templates = await (await request.get("/api/pdf-templates")).json();
      const fieldless = templates.find((t: { id: number }) => t.id === fieldlessTemplateId);
      const seeded = templates.find((t: { id: number }) => t.id === seededTemplateId);
      expect(fieldless.isDefault).toBe(true);
      expect(fieldless.fields).toEqual([]);
      expect(seeded.isDefault).toBe(false);
    });

    await test.step("2. pickup via the UI: the dialog shows this task's own Dutch sentence, translated by code", async () => {
      const story = new Story("Ophalen met een leeg standaardsjabloon", BUDGET.pickup);
      // The one free navigation (constraints.md): straight to the screen
      // this spec is about.
      await page.goto("/reservations");
      await settle(page);

      const block = page.locator('[data-testid^="reservation-item-"]', { hasText: CUSTOMER_NAME }).first();
      await story.click(block, "reservering openen");

      const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
      await expect(viewDialog).toBeVisible();
      await story.click(viewDialog.getByTestId("button-start-pickup-calendar"), "Ophalen starten");

      const pickupDialog = page.getByRole("dialog", { name: "Ophaalproces starten" });
      await expect(pickupDialog).toBeVisible();
      await story.fill(pickupDialog.getByTestId("input-contract-number"), `9${reservationId}`, "Contractnummer");
      await story.click(pickupDialog.getByTestId("button-confirm-pickup"), "Ophalen voltooien & contract genereren");

      // Same stacking fault as the desk story (rental-story.spec.ts, stage 3):
      // the reopened reservation view can end up on top of this dialog. Only
      // visibility is asserted below (Playwright's own definition — a
      // non-zero box, not `display:none`/`visibility:hidden`), which holds
      // regardless of what else is drawn on top of it.
      const handover = page.getByTestId("dialog-handover-result");
      await expect(handover).toBeVisible();
      await expect(handover.getByText("Contract kon niet gemaakt worden")).toBeVisible();
      // Task 6's own point: translated by `code` (TEMPLATE_WITHOUT_FIELDS),
      // never the server's English message (which names the template and
      // says to "open it in the template editor" — a sentence this dialog
      // must not be showing).
      await expect(
        handover.getByText(
          "Het contractsjabloon heeft geen velden. Vul het sjabloon onder Documenten → Contractsjablonen.",
        ),
      ).toBeVisible();
      await expect(handover.getByTestId("button-handover-retry")).toBeVisible();
      story.finish();
    });

    await test.step("3. via the API: restore the seeded template as default, and remove this spec's own extra one", async () => {
      const restored = await request.patch(`/api/pdf-templates/${seededTemplateId}`, {
        headers: { "X-CSRF-Token": csrfToken! },
        data: { isDefault: true },
      });
      expect(restored.status(), await restored.text()).toBe(200);
      // Unlike POST, PATCH's own response body *does* map to camelCase
      // (server/database-storage.ts updatePdfTemplate()) — trusted directly.
      expect((await restored.json()).isDefault).toBe(true);

      const deleted = await request.delete(`/api/pdf-templates/${fieldlessTemplateId}`, {
        headers: { "X-CSRF-Token": csrfToken! },
      });
      expect(deleted.ok(), await deleted.text()).toBeTruthy();

      const templates = await (await request.get("/api/pdf-templates")).json();
      expect(templates.find((t: { id: number }) => t.id === seededTemplateId)?.isDefault).toBe(true);
      expect(templates.find((t: { id: number }) => t.id === fieldlessTemplateId)).toBeUndefined();
    });

    expect(health.violations).toEqual([]);
  });
});
