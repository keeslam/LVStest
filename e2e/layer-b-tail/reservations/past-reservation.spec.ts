/**
 * besluiten.md B-32 aanvulling (2026-09-23) — the popup for never-collected
 * bookings a month old, walked end to end: a stale booking is created (via
 * the API, the way a real one would only ever arrive — nobody clicks
 * through a form to backdate a booking 40 days), the popup shows it, a brand
 * new booking on the same vehicle is unaffected by it, and cancelling the
 * stale row through the popup empties it.
 *
 * Runs alone, after layer-a and layer-b (e2e/playwright.config.ts,
 * "layer-b-tail" project) rather than concurrently with them: this spec
 * leaves the not-collected dialog open across several of its own steps
 * (reopening it, cancelling a row through it), and a concurrent spec
 * creating or cancelling *other* rows on the shared `lvs_e2e` database while
 * that modal is up could not be told apart from this spec's own state by
 * anything short of a database of its own — running last and alone avoids
 * that without needing one.
 *
 * Vehicle E2E-07-G (seed index 6, e2e/seed/data.ts) carries only a
 * `cancelled` reservation in the seed — exactly the "nothing else touches
 * this vehicle" precondition B-32's own gate needs to prove a never-collected
 * `booked` row does not block a new booking.
 */
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { officeDay } from "../../seed/data";

// Seed customer (e2e/seed/data.ts, index 0) — reused rather than created by
// this spec, since B-32 has nothing to do with who the customer is.
const CUSTOMER_EMAIL = "devries@e2e.invalid";
const CUSTOMER_NAME = "E2E Bouwbedrijf De Vries B.V.";
const VEHICLE_PLATE = "E2E-07-G";
const VEHICLE_PLATE_COMPACT = "E2E07G"; // how the vehicle popover renders it, no dashes

// Measured for this spec (there is no prior "approved flow" for a popup that
// did not exist before this task): stage 1b (filter the vehicles page down
// to the one plate), stage 2 (close the popup that auto-opened on the first
// visit — the visit itself is the free navigation, see below), stage 3 (a
// customer-row booking on the same vehicle) and stage 4 (reopen + cancel the
// stale row through the popup).
const BUDGET = { checkVehiclePage: 1, viewAndClose: 1, newBooking: 7, reopenAndCancel: 4 };

test.describe("Reserveringskalender: niet opgehaalde boeking van een maand oud (B-32 aanvulling)", () => {
  // Same tall viewport as rental-story.spec.ts / edge-cases.spec.ts: the
  // vehicle popover (vehicle-selector.tsx) opens `avoidCollisions={false}`
  // and is positioned `fixed`, so a clipped popover at the default 720px
  // height cannot be scrolled into view.
  //
  // Role: `manager` rather than `admin`. Both hold MANAGE_RESERVATIONS (the
  // only right this spec needs, besides VIEW_RESERVATIONS which both also
  // hold), but `admin` is the one role `dialogs.spec.ts`/`forbidden.spec.ts`
  // (layer-a) exercise on every single registry entry — by the time this
  // project starts (after layer-a AND layer-b finish, same server process,
  // same 15-minute `apiLimiter` window, server/middleware/security/rateLimiter.ts)
  // its 1000-request budget is measurably exhausted: a first run authenticated
  // as `admin` here got a wall of 429s on the very first request. `manager`
  // is not privileged in any way this spec relies on — it is simply a
  // different bucket with headroom left.
  test.use({ storageState: authFile("manager"), viewport: { width: 1280, height: 1400 } });

  test("popup toont een nooit-opgehaalde boeking, blokkeert niets nieuws, en annuleren maakt de lijst leeg", async ({ page, health, request }) => {
    test.setTimeout(120_000);

    let staleReservationId: number;
    let vehicleId: number;

    await test.step("0. seed a never-collected booking on E2E-07-G (via the API, not counted)", async () => {
      // The double-submit CSRF cookie the app's own client reads and echoes
      // back on every mutating request (server/middleware/security/csrf.ts).
      // Already on this context from `storageState` (auth.setup.ts's own
      // sign-in wrote it), and readable before any navigation — a browser
      // context's cookie jar is populated from `storageState` at creation,
      // not on first page load.
      const cookies = await page.context().cookies();
      const csrfToken = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
      expect(csrfToken, "XSRF-TOKEN cookie from storageState").toBeTruthy();

      const firstRead = await request.get("/api/vehicles");
      // Diagnostic only (server/middleware/security/rateLimiter.ts apiLimiter,
      // standardHeaders: true) — this project runs last, sharing the whole
      // suite's one 15-minute window on whichever account it signs in as;
      // printed so a future 429 here shows the actual remaining budget
      // instead of a bare failure.
      console.log(`[layer-b-tail] apiLimiter remaining for this account: ${firstRead.headers()["ratelimit-remaining"]} / ${firstRead.headers()["ratelimit-limit"]}`);
      const vehicles = await firstRead.json();
      const vehicle = vehicles.find((v: { licensePlate: string }) => v.licensePlate === VEHICLE_PLATE);
      expect(vehicle, `seeded vehicle ${VEHICLE_PLATE}`).toBeTruthy();
      vehicleId = vehicle.id;

      const customers = await (await request.get("/api/customers")).json();
      const customer = customers.find((c: { email: string }) => c.email === CUSTOMER_EMAIL);
      expect(customer, `seeded customer ${CUSTOMER_EMAIL}`).toBeTruthy();

      // B-32's "allowed" case: a booked rental nobody ever picked up, started
      // 40 days ago (well past the 30-day threshold), ended 36 days ago.
      const created = await request.post("/api/reservations", {
        headers: { "X-CSRF-Token": csrfToken! },
        data: {
          customerId: customer.id,
          vehicleId,
          startDate: officeDay(-40),
          endDate: officeDay(-36),
          type: "standard",
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const body = await created.json();
      expect(body.status).toBe("booked");
      staleReservationId = body.id;
    });

    await test.step("1. the vehicle is still available (B-32: never-collected does not block or occupy it)", async () => {
      const vehicles = await (await request.get("/api/vehicles")).json();
      const vehicle = vehicles.find((v: { id: number }) => v.id === vehicleId);
      expect(vehicle.availabilityStatus).toBe("available");

      // task-2-review.md Minor 1 — the API read above proves the underlying
      // fact, but not what a staff member actually looks at: the /vehicles
      // page's own status badge (client/src/pages/vehicles/index.tsx) for
      // this exact vehicle. Filtered by plate so this holds regardless of
      // pagination or how many other vehicles exist by the time this project
      // runs last in the suite.
      const story = new Story("Voertuigstatus controleren op de voertuigenpagina", BUDGET.checkVehiclePage);
      await page.goto("/vehicles");
      await settle(page);
      await story.fill(
        page.getByPlaceholder("Zoeken op kenteken, merk of model..."),
        VEHICLE_PLATE,
        "voertuig zoeken",
      );
      const row = page.locator("table tr", { hasText: VEHICLE_PLATE_COMPACT });
      await expect(row).toContainText("Beschikbaar");
      story.finish();
    });

    await test.step("2. the calendar's popup shows it, and closes", async () => {
      const story = new Story("Popup bekijken en sluiten", BUDGET.viewAndClose);
      // The one free navigation (constraints.md): straight to the screen
      // this spec is about, not the dashboard — the stale row above must
      // already exist before this load, or the popup's own query would have
      // nothing to auto-open on.
      await page.goto("/reservations");
      await settle(page);

      // Auto-opened (calendar.tsx, first time this session sees a non-empty
      // list) — not a click, so not counted.
      const popup = page.getByTestId("dialog-not-collected");
      await expect(popup).toBeVisible();
      const row = page.getByTestId(`not-collected-reservation-${staleReservationId}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(VEHICLE_PLATE_COMPACT);
      await expect(row).toContainText(CUSTOMER_NAME);

      await story.click(page.getByTestId("button-close-not-collected"), "Sluiten");
      await expect(popup).toBeHidden();
      story.finish();
    });

    await test.step("3. a brand new booking on the same vehicle succeeds, no overdue dialog", async () => {
      const story = new Story("Nieuwe boeking op hetzelfde voertuig", BUDGET.newBooking);
      // exact: true — "Klanten" is otherwise also a substring match for the
      // "Klantenportaal" sidebar item, which `user` (rental-story.spec.ts's
      // role) does not see but `manager` does.
      await story.click(page.getByRole("link", { name: "Klanten", exact: true }), "Klanten");
      await settle(page);

      await story.fill(page.getByTestId("input-search-customers"), CUSTOMER_EMAIL, "klant zoeken");
      const row = page.locator("tr", { hasText: CUSTOMER_NAME });
      await story.click(row.getByRole("button", { name: "Nieuwe reservering" }), "Nieuwe reservering");

      const dialog = page.getByRole("dialog", { name: "Nieuwe reservering" });
      await expect(dialog).toBeVisible();
      // Pre-fills, not counted: the customer is already selected (opened
      // from their row) and the period already defaults to today..today+3 —
      // both in the future, exactly what this step needs.

      await story.click(dialog.getByRole("button", { name: /Zoek en selecteer een voertuig/ }), "voertuig zoeken openen");
      await story.fill(page.getByPlaceholder("Zoek op kenteken, merk of model..."), VEHICLE_PLATE, `zoek ${VEHICLE_PLATE}`);
      await story.click(page.locator("div.rounded-md.border.cursor-pointer", { hasText: VEHICLE_PLATE_COMPACT }), `voertuig ${VEHICLE_PLATE} (Fiat Ducato)`);

      await story.click(dialog.getByTestId("button-submit-reservation"), "Reservering aanmaken");
      await settle(page);

      // B-32's own point: the stale never-collected row must not have
      // blocked this — no overdue-dialog title anywhere on screen.
      await expect(page.getByText("Achterstallige reserveringen gevonden")).toHaveCount(0);
      story.finish();

      // Not counted (an API read, not a click): confirms the booking really
      // landed, the way rental-story.spec.ts's own stage 2 does.
      const reservations = await (await request.get("/api/reservations")).json();
      const newBooking = reservations.find(
        (r: { vehicleId: number; status: string; id: number }) =>
          r.vehicleId === vehicleId && r.status === "booked" && r.id !== staleReservationId,
      );
      expect(newBooking, "the new booking on E2E-07-G").toBeTruthy();
    });

    await test.step("4. reopening the popup and cancelling the stale row empties it", async () => {
      const story = new Story("Popup opnieuw openen en annuleren", BUDGET.reopenAndCancel);
      await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
      await settle(page);

      // Already shown once this session (step 2) — must NOT auto-open again.
      const popup = page.getByTestId("dialog-not-collected");
      await expect(popup).toBeHidden();

      await story.click(page.getByTestId("button-view-not-collected"), "Niet opgehaalde reserveringen bekijken");
      await expect(popup).toBeVisible();

      await story.click(page.getByTestId(`button-cancel-not-collected-${staleReservationId}`), "Annuleren");
      const cancelDialog = page.getByTestId("dialog-cancel-reservation");
      await expect(cancelDialog).toBeVisible();
      // Nothing attached to this rental (it was never picked up), so there
      // is nothing to tick before confirming.
      await story.click(cancelDialog.getByTestId("button-confirm-cancel-reservation"), "Reservering annuleren (bevestigen)");
      await expect(cancelDialog).toBeHidden();

      await expect(page.getByTestId(`not-collected-reservation-${staleReservationId}`)).toHaveCount(0);
      await expect(page.getByTestId("not-collected-empty")).toBeVisible();
      story.finish();
    });

    await test.step("5. after a reload, neither the popup nor the toolbar button reappears", async () => {
      await page.reload();
      await settle(page);
      await expect(page.getByTestId("dialog-not-collected")).toBeHidden();
      await expect(page.getByTestId("button-view-not-collected")).toHaveCount(0);
    });

    expect(health.violations).toEqual([]);
  });
});
