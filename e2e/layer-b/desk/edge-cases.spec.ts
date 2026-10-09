/**
 * Edge cases staff already hit, walked as the desk profile (`user`). Each
 * test stands alone (its own reservation, its own health watcher) so one
 * fault does not hide the others. Every page interaction still goes through
 * `Story`, same as rental-story.spec.ts; budgets here are just this test's
 * own measured count (there is no "approved flow" for an edge case to stay
 * under — the point is reproducing it, not shrinking it).
 *
 * Several of these deliberately provoke a non-2xx response. Chrome logs every
 * response >= 400 as its own console error regardless of how gracefully the
 * app handles it (see guards.ts); `consumeExpected` removes exactly that one
 * expected entry (and, where the app also raises a destructive toast for it,
 * that entry too) so `health`'s teardown still fails on anything else.
 */
import { test, expect, settle, type Violation } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { request as newApiRequestContext } from "@playwright/test";
import { E2E } from "../../support/env";
import { officeDay } from "../../seed/data";

// Taller than Playwright's 720px default: the vehicle popover
// (vehicle-selector.tsx, opened by the "dubbele boeking" test below) has
// `avoidCollisions={false}` and is positioned `fixed` to the viewport, so a
// clipped popover cannot be scrolled into view — see the longer comment in
// rental-story.spec.ts, where the same popover made stage 2 flaky.
test.use({ storageState: authFile("user"), viewport: { width: 1280, height: 1400 } });

function consumeExpected(health: { violations: Violation[] }, kind: Violation["kind"], pattern: RegExp) {
  const index = health.violations.findIndex((v) => v.kind === kind && pattern.test(v.detail));
  expect(index, `expected a "${kind}" violation matching ${pattern}`).toBeGreaterThanOrEqual(0);
  health.violations.splice(index, 1);
}

test("lege startdatum: het scherm blijft staan, maar de duurweergave liegt door naar '1 dag'", async ({ page, health }) => {
  const story = new Story("Lege startdatum", 3);
  await page.goto("/");
  await settle(page);
  await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
  await settle(page);
  await story.click(page.getByRole("button", { name: "Nieuwe reservering" }), "Nieuwe reservering");

  const dialog = page.getByRole("dialog", { name: "Nieuwe reservering" });
  await expect(dialog).toBeVisible();
  const endDateField = dialog.getByLabel("Einddatum", { exact: true });
  // Pre-fill, not counted: a fresh dialog already proposes today+3 before
  // anything is touched — this is the value the brief calls "the end date
  // suggestion", checked again below after the start date is cleared.
  const endDateBefore = await endDateField.inputValue();
  expect(endDateBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await story.fill(dialog.getByLabel("Startdatum", { exact: true }), "", "Startdatum wissen");
  await settle(page);

  // No error boundary: this used to throw "Invalid time value" and take the
  // whole reservations page down (see client/src/lib/suggest-end-date.ts).
  await expect(page.getByText("Er ging iets mis op dit scherm")).toHaveCount(0);

  // task-8-brief.md's own words: "the end date suggestion is empty". It is
  // not — asserted here as what the brief expects, immediately followed by
  // what the field actually holds, so this fails loudly instead of passing
  // silently if a future fix changes only one of the two.
  //
  // OBSERVATION (kind: a default was wrong) — reservation-form.tsx only
  // recomputes `endDate` when the field is currently empty or the rental was
  // just switched from open-ended (the "Update end date when open-ended
  // status changes" effect); merely clearing the start date satisfies
  // neither condition, so the End Date field is left holding its original
  // suggestion (today+3) even though the row it was suggested for no longer
  // has a start date. Verified directly on the field's own value, not just
  // the read-only summary below.
  await expect(endDateField).not.toHaveValue("");
  await expect(endDateField).toHaveValue(endDateBefore);

  // The inline duration badge right under the date fields correctly
  // disappears — it is gated on the start date being present
  // (reservation-form.tsx: `{startDateWatch && rentalDuration !== null && (...)}`).
  //
  // OBSERVATION (kind: a default was wrong) — but the read-only "Huurperiode
  // (hierboven geselecteerd)" summary further down has no such guard: its
  // duration comes from `rentalDuration`, which explicitly falls back to `1`
  // for an empty start date (`if (!startDateWatch) return 1;`). So the
  // summary shows "Startdatum: Niet geselecteerd" and "Duur: 1 dag" side by
  // side — a duration for a period that, by the row right next to it, does
  // not exist. The same `1` also feeds the total-price auto-fill effect
  // whenever a vehicle happens to be selected already.
  await expect(dialog.getByText("Startdatum: Niet geselecteerd")).toBeVisible();
  await expect(dialog.getByText("Duur: 1 dag")).toBeVisible();
  story.finish();

  expect(health.violations).toEqual([]);
});

test("ophalen voor de startdatum vraagt eerst (B-16); bij nee blijft de reservering geboekt", async ({ page, health, request }) => {
  const reservations = await (await request.get("/api/reservations")).json();
  const target = reservations.find((r: { notes?: string }) => r.notes === "e2e:next-week");
  expect(target, "seeded reservation e2e:next-week").toBeTruthy();

  const story = new Story("Ophalen voor de startdatum", 7);
  await page.goto("/");
  await settle(page);
  await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
  await settle(page);
  await story.click(page.getByTestId("button-list-view"), "Reserveringen als lijst");
  const listDialog = page.getByTestId("dialog-reservation-list");
  await expect(listDialog).toBeVisible();
  await story.click(listDialog.getByTestId(`view-btn-${target.id}`), "reservering bekijken");

  const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
  await expect(viewDialog).toBeVisible();
  await story.click(viewDialog.getByTestId("button-start-pickup-calendar"), "Ophalen starten");

  const pickupDialog = page.getByRole("dialog", { name: "Ophaalproces starten" });
  await story.fill(pickupDialog.getByTestId("input-contract-number"), "9100001", "Contractnummer");
  await story.click(pickupDialog.getByTestId("button-confirm-pickup"), "Ophalen voltooien & contract genereren");

  // besluiten.md B-16 — the server refuses with 409 PICKUP_BEFORE_START_DATE
  // and writes nothing; the dialog turns that into a question.
  const confirm = page.getByTestId("confirm-dialog");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByTestId("confirm-dialog-title")).toHaveText("De huur start eerder — datum aanpassen?");
  consumeExpected(health, "console", /responded with a status of 409/);

  await story.click(confirm.getByTestId("confirm-dialog-cancel"), "Nee, niet ophalen");
  await expect(confirm).toBeHidden();
  story.finish();

  const after = await (await request.get(`/api/reservations/${target.id}`)).json();
  expect(after.status).toBe("booked");
  expect(after.contractNumber).toBeNull();

  expect(health.violations).toEqual([]);
});

test("dubbele boeking op een opgehaald voertuig wordt geweigerd, er wordt niets aangemaakt", async ({ page, health, request }) => {
  const before = await (await request.get("/api/reservations")).json();

  const story = new Story("Dubbele boeking", 7);
  await page.goto("/");
  await settle(page);
  await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
  await settle(page);
  await story.click(page.getByRole("button", { name: "Nieuwe reservering" }), "Nieuwe reservering");

  const dialog = page.getByRole("dialog", { name: "Nieuwe reservering" });
  await expect(dialog).toBeVisible();
  // The seeded "picked-up" reservation makes E2E-03-C unavailable, so the
  // default (smart-filtered) picker does not even offer it — staff has to
  // deliberately widen the search to "all vehicles" to attempt this booking
  // at all. Leave the default period (today .. today+3): that reservation
  // already covers today.
  //
  // Located by test id, not role/label: the "Toon alle voertuigen" <label>
  // has htmlFor="show-all-vehicles", but the checkbox itself has no such id
  // (only a data-testid) — the label is not actually wired to the control,
  // so clicking the text would do nothing for a real user either.
  await story.click(dialog.getByTestId("checkbox-show-all-vehicles"), "Toon alle voertuigen");
  await story.click(dialog.getByRole("button", { name: /Zoek en selecteer een voertuig/ }), "voertuig zoeken openen");
  await story.fill(page.getByPlaceholder("Zoek op kenteken, merk of model..."), "E2E-03-C", "zoek E2E-03-C");
  // Not scoped to `dialog`: Radix Popover portals its content straight onto
  // <body>, as a sibling of the dialog rather than a descendant.
  // `.rounded-md.border` (not just `.cursor-pointer`): the calendar month
  // grid behind this dialog already shows E2E-03-C's own seeded reservation,
  // whose day cells and bars also use `cursor-pointer` and would otherwise
  // also match.
  await story.click(page.locator("div.rounded-md.border.cursor-pointer", { hasText: "E2E03C" }), "voertuig E2E-03-C");
  await settle(page);

  // Caught client-side (a plain GET to /api/reservations/booking-check, never
  // a failing request) before anything is ever submitted.
  await expect(dialog.getByText("Dit voertuig is al gereserveerd voor de geselecteerde data. Kies andere data of een ander voertuig.")).toBeVisible();
  await expect(dialog.getByTestId("button-submit-reservation")).toBeDisabled();

  await story.click(dialog.getByRole("button", { name: "Annuleren" }), "Annuleren");
  story.finish();

  const after = await (await request.get("/api/reservations")).json();
  expect(after.length).toBe(before.length);

  expect(health.violations).toEqual([]);
});

test("inleveren met een lagere kilometerstand wordt geweigerd, nooit stil opgeslagen", async ({ page, health, request }) => {
  const reservations = await (await request.get("/api/reservations")).json();
  const target = reservations.find((r: { notes?: string }) => r.notes === "e2e:picked-up");
  expect(target, "seeded reservation e2e:picked-up").toBeTruthy();
  expect(target.pickupMileage).toBe(61000);

  const story = new Story("Inleveren met lagere kilometerstand", 6);
  await page.goto("/");
  await settle(page);
  await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
  await settle(page);
  await story.click(page.getByTestId("button-list-view"), "Reserveringen als lijst");
  const listDialog = page.getByTestId("dialog-reservation-list");
  await expect(listDialog).toBeVisible();
  await story.click(listDialog.getByTestId(`view-btn-${target.id}`), "reservering bekijken");

  const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
  await expect(viewDialog).toBeVisible();
  await story.click(viewDialog.getByTestId("button-start-return-calendar"), "Inleveren starten");

  const returnDialog = page.getByRole("dialog", { name: "Inleverproces starten" });
  await story.fill(returnDialog.getByTestId("input-return-mileage"), "60000", "Kilometerstand bij inleveren");
  await story.click(returnDialog.getByTestId("button-confirm-return"), "Inleveren voltooien & schadecheck genereren");

  // Refused client-side, in Dutch, before any request is even sent
  // (pickup-return-dialogs.tsx handleSubmit checks `mileage <
  // reservation.pickupMileage` itself) — never saved silently. No network
  // round trip happens here at all, so there is no console violation to
  // consume, only the destructive toast this refusal is shown through.
  await expect(page.locator("li.destructive").getByText("Kilometerstand bij inleveren kan niet lager zijn dan bij ophalen (61000 km).")).toBeVisible();
  consumeExpected(health, "toast", /Kilometerstand bij inleveren kan niet lager zijn dan bij ophalen/);
  story.finish();

  const after = await (await request.get(`/api/reservations/${target.id}`)).json();
  expect(after.status).toBe("picked_up");
  expect(after.returnMileage).toBeNull();

  expect(health.violations).toEqual([]);
});

test("net na middernacht: de ophaaldatum volgt de kantoortijdzone, niet UTC", async ({ page, health, request }) => {
  const reservations = await (await request.get("/api/reservations")).json();
  const target = reservations.find((r: { notes?: string }) => r.notes === "e2e:today-booked");
  expect(target, "seeded reservation e2e:today-booked").toBeTruthy();

  // A literal, fixed instant unrelated to any seeded date (constraints.md /
  // task-8-brief.md Step 4): 22:30 UTC on 2026-09-20 is already 00:30 CEST
  // (Europe/Amsterdam) on 2026-09-21. Not a Story action: this sets up the
  // browser clock, it is not something staff does.
  await page.clock.setFixedTime(new Date("2026-09-20T22:30:00Z"));

  const story = new Story("Net na middernacht", 5);
  await page.goto("/");
  await settle(page);
  await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
  await settle(page);
  await story.click(page.getByTestId("button-list-view"), "Reserveringen als lijst");

  // The "current" tab lists every booked/picked-up reservation regardless of
  // date, so the frozen clock (a different day, possibly a different month,
  // from whenever the suite actually seeded its data) cannot hide the row the
  // way the calendar's own month grid would.
  const listDialog = page.getByTestId("dialog-reservation-list");
  await expect(listDialog).toBeVisible();
  await story.click(listDialog.getByTestId(`view-btn-${target.id}`), "reservering bekijken");

  const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
  await expect(viewDialog).toBeVisible();
  await story.click(viewDialog.getByTestId("button-start-pickup-calendar"), "Ophalen starten");

  const pickupDialog = page.getByRole("dialog", { name: "Ophaalproces starten" });
  await expect(pickupDialog.locator("#pickupDate")).toHaveValue("2026-09-21");

  // Leave nothing changed.
  await story.click(pickupDialog.getByTestId("button-cancel-pickup"), "Annuleren");
  story.finish();

  expect(health.violations).toEqual([]);
});

test("debiteurnummer al in gebruik (B-35): veldfout onder het invoerveld, ook tegen de prullenbak", async ({ page, health }) => {
  const story = new Story("Debiteurnummer-conflict", 16);
  await page.goto("/");
  await settle(page);
  await story.click(page.getByRole("link", { name: "Klanten" }), "Klanten");
  await settle(page);

  const dialog = page.getByRole("dialog", { name: "Nieuwe klant toevoegen" });

  // 1. First customer takes "E2E-DEB-1".
  await story.click(page.getByTestId("button-add-customer"), "Klant toevoegen");
  await expect(dialog).toBeVisible();
  await story.fill(dialog.getByLabel("Volledige naam"), "Debiteur Klant Een", "Volledige naam");
  await story.fill(dialog.getByTestId("input-debtor-number"), "E2E-DEB-1", "Debiteurnummer");
  await story.click(dialog.getByRole("button", { name: "Klant toevoegen" }), "Klant toevoegen (opslaan)");
  await settle(page);
  await expect(page.getByText("Debiteur Klant Een")).toBeVisible();

  // 2. A second customer tries the same number, different case — refused,
  // the dialog stays open, the field names who already holds it.
  await story.click(page.getByTestId("button-add-customer"), "Klant toevoegen");
  await expect(dialog).toBeVisible();
  await story.fill(dialog.getByLabel("Volledige naam"), "Debiteur Klant Twee", "Volledige naam");
  await story.fill(dialog.getByTestId("input-debtor-number"), "e2e-deb-1", "Debiteurnummer (kleine letters)");
  await story.click(dialog.getByRole("button", { name: "Klant toevoegen" }), "Klant toevoegen (opslaan)");
  await settle(page);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Dit debiteurnummer is al in gebruik bij klant Debiteur Klant Een.")).toBeVisible();
  await expect(page.getByText("Kon de gegevens niet laden")).toHaveCount(0);
  consumeExpected(health, "console", /responded with a status of 409/);
  consumeExpected(health, "toast", /Kon klant niet aanmaken/);

  // Corrected to a free number — saved, dialog closes.
  await story.fill(dialog.getByTestId("input-debtor-number"), "E2E-DEB-2", "Debiteurnummer (gecorrigeerd)");
  await story.click(dialog.getByRole("button", { name: "Klant toevoegen" }), "Klant toevoegen (opslaan)");
  await settle(page);
  await expect(page.getByText("Debiteur Klant Twee")).toBeVisible();

  // Not a Story action: staff never does this — an admin deletes the
  // customer from elsewhere (recycle bin), through the same API the delete
  // dialog itself calls (DELETE /api/customers/:id), independently of the
  // desk role this test otherwise uses throughout.
  const adminApi = await newApiRequestContext.newContext({ baseURL: E2E.baseUrl, storageState: authFile("admin") });
  let deletedCustomerId: number;
  try {
    const customers = await (await adminApi.get("/api/customers")).json();
    const target = customers.find((c: { debtorNumber?: string | null }) => c.debtorNumber === "E2E-DEB-2");
    expect(target, 'customer holding "E2E-DEB-2"').toBeTruthy();
    deletedCustomerId = target.id;
    // DELETE is a mutation: server/middleware/security/csrf.ts demands
    // X-CSRF-Token on every non-GET request. An APIRequestContext carries the
    // cookies from `storageState` but, unlike apiRequest()'s getCsrfToken()
    // (client/src/lib/queryClient.ts) inside the app itself, never reads one
    // back into a header on its own — read it from the same storage state.
    const { cookies } = await adminApi.storageState();
    const csrfToken = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
    expect(csrfToken, "XSRF-TOKEN cookie in the admin storage state").toBeTruthy();
    const deleteResponse = await adminApi.delete(`/api/customers/${deletedCustomerId}`, {
      headers: { "X-CSRF-Token": csrfToken! },
    });
    expect(deleteResponse.ok()).toBeTruthy();
  } finally {
    await adminApi.dispose();
  }

  // 3. A third customer tries the now-deleted number — the bin, not the
  // (now empty) live table, is what refuses it.
  await story.click(page.getByTestId("button-add-customer"), "Klant toevoegen");
  await expect(dialog).toBeVisible();
  await story.fill(dialog.getByLabel("Volledige naam"), "Debiteur Klant Drie", "Volledige naam");
  await story.fill(dialog.getByTestId("input-debtor-number"), "E2E-DEB-2", "Debiteurnummer");
  await story.click(dialog.getByRole("button", { name: "Klant toevoegen" }), "Klant toevoegen (opslaan)");
  await settle(page);

  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "Dit debiteurnummer hoort bij klant Debiteur Klant Twee in de prullenbak. Zet die klant terug of verwijder hem definitief uit de prullenbak.",
    ),
  ).toBeVisible();
  consumeExpected(health, "console", /responded with a status of 409/);
  consumeExpected(health, "toast", /Kon klant niet aanmaken/);

  // Do not leave a modal open (constraints.md / task-4-brief.md): the
  // dialog's own close control, not "Annuleren" (customer-form.tsx's cancel
  // button only resets the embedded form here, it does not close the dialog).
  await story.click(dialog.getByRole("button", { name: "Sluiten" }), "dialoog sluiten");
  await expect(dialog).toBeHidden();
  story.finish();

  expect(health.violations).toEqual([]);
});

// ---------------------------------------------------------------------------
// Sub-project C, Task 4 (besluiten B-30, B-39): undoing a handover is ONE
// dialog with a preview and a confirm, for everyone, and needs the new right
// `revert_handover`. Two short stories, each with its own budget; the desk
// story above and its budgets are untouched.
// ---------------------------------------------------------------------------

test.describe("Overdracht terugdraaien (B-30)", () => {
  // `manager`, not `admin`: both hold revert_handover (admin by bypass, manager
  // by the one-time grant and the e2e profile `without(...)`), but `admin` is
  // the account layer-a spends its whole 15-minute apiLimiter budget on, so by
  // the time this layer runs it can answer 429 (see past-reservation.spec.ts).
  // Same tall viewport as the other desk stories (vehicle popovers, stacked
  // dialogs).
  test.describe("met het recht", () => {
    test.use({ storageState: authFile("manager"), viewport: { width: 1280, height: 1400 } });

    // 10 handelingen, gemeten: 3 om de reservering te openen (Reserveringen,
    // lijst, bekijken), 4 om op te halen (starten, kilometerstand met de
    // tikfout, contractnummer, voltooien) en 3 om terug te draaien (knop,
    // vinkje voor de lagere kilometerstand, bevestigen).
    test("ophalen met een tikfout in de kilometerstand, daarna terugdraaien: status, kilometerstand en voertuig zijn terug", async ({ page, health, request }) => {
      test.setTimeout(180_000);

      // Not counted: the state this story needs, made through the API the way
      // the rest of the app would have produced it. A vehicle of its own (no
      // seeded plate is free of another spec) and a booking whose period is
      // already over, so that "Beschikbaar" after the undo is a fact about the
      // undo and not about a booking that still covers today.
      const cookies = await page.context().cookies();
      const csrfToken = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
      expect(csrfToken, "XSRF-TOKEN cookie from storageState").toBeTruthy();
      const headers = { "X-CSRF-Token": csrfToken! };

      const vehicleResponse = await request.post("/api/vehicles", {
        headers,
        data: { licensePlate: "E2E-RV-1", brand: "Fiat", model: "Doblo", currentMileage: 20000 },
      });
      expect(vehicleResponse.ok(), await vehicleResponse.text()).toBeTruthy();
      const vehicle = await vehicleResponse.json();
      expect(vehicle.currentMileage).toBe(20000);

      const customers = await (await request.get("/api/customers")).json();
      const customer = customers.find((c: { email: string }) => c.email === "bakker@e2e.invalid");
      expect(customer, "seeded customer bakker@e2e.invalid").toBeTruthy();

      const reservationResponse = await request.post("/api/reservations", {
        headers,
        data: { customerId: customer.id, vehicleId: vehicle.id, startDate: officeDay(-5), endDate: officeDay(-2), type: "standard" },
      });
      expect(reservationResponse.status(), await reservationResponse.text()).toBe(201);
      const reservation = await reservationResponse.json();
      expect(reservation.status).toBe("booked");

      const story = new Story("Overdracht terugdraaien", 10);
      await page.goto("/");
      await settle(page);
      await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
      await settle(page);
      await story.click(page.getByTestId("button-list-view"), "Reserveringen als lijst");
      const listDialog = page.getByTestId("dialog-reservation-list");
      await expect(listDialog).toBeVisible();
      await story.click(listDialog.getByTestId(`view-btn-${reservation.id}`), "reservering bekijken");

      const viewDialog = page.getByRole("dialog", { name: "Reserveringsdetails" });
      await expect(viewDialog).toBeVisible();
      // A booking has nothing to undo yet: no opener (the picked-up state is
      // what makes it appear), the pickup button is what is offered.
      await expect(viewDialog.getByTestId("button-revert-handover")).toHaveCount(0);
      await story.click(viewDialog.getByTestId("button-start-pickup-calendar"), "Ophalen starten");

      // The tikfout: 20350 km typed for a van that stands at 20000 km.
      const pickupDialog = page.getByRole("dialog", { name: "Ophaalproces starten" });
      await expect(pickupDialog.getByTestId("input-pickup-mileage")).toHaveValue("20000");
      await story.fill(pickupDialog.getByTestId("input-pickup-mileage"), "20350", "Kilometerstand bij ophalen (tikfout)");
      await story.fill(pickupDialog.getByTestId("input-contract-number"), "9300001", "Contractnummer");
      await story.click(pickupDialog.getByTestId("button-confirm-pickup"), "Ophalen voltooien & contract genereren");
      await expect(page.getByTestId("dialog-handover-result")).toBeVisible();

      const pickedUp = await (await request.get(`/api/reservations/${reservation.id}`)).json();
      expect(pickedUp.status).toBe("picked_up");
      expect(pickedUp.pickupMileage).toBe(20350);
      const afterPickup = (await (await request.get("/api/vehicles")).json()).find((v: { id: number }) => v.id === vehicle.id);
      expect(afterPickup.currentMileage).toBe(20350);
      expect(afterPickup.availabilityStatus).toBe("rented");

      // The reservation view is reopened on top with the picked-up state and
      // now offers the way back - the same button on every status that can be
      // undone, always opening the preview, never a one-click revert.
      await expect(viewDialog.getByTestId("button-start-return-calendar")).toBeVisible();
      await story.click(viewDialog.getByTestId("button-revert-handover"), "Overdracht terugdraaien");

      const revertDialog = page.getByTestId("dialog-revert-handover");
      await expect(revertDialog).toBeVisible();
      // Nothing has been written yet: the dialog only SHOWS what would happen.
      await expect(revertDialog.getByTestId("revert-status")).toContainText("Opgehaald");
      await expect(revertDialog.getByTestId("revert-status")).toContainText("Geboekt");
      await expect(revertDialog.getByTestId("revert-clears")).toContainText("Contractnummer");
      await expect(revertDialog.getByTestId("revert-vehicle")).toContainText("van 20.350 km naar 20.000 km");
      await expect(revertDialog.getByTestId("revert-documents")).toContainText("vervallen");
      const confirm = revertDialog.getByTestId("button-confirm-revert");
      await expect(confirm).toBeDisabled();
      expect((await (await request.get(`/api/reservations/${reservation.id}`)).json()).status).toBe("picked_up");

      // The odometer goes DOWN (20350 -> 20000): that needs an explicit tick.
      await story.click(revertDialog.getByTestId("checkbox-confirm-mileage-decrease"), "bevestigen: kilometerstand gaat omlaag");
      await expect(confirm).toBeEnabled();
      await story.click(confirm, "Overdracht terugdraaien (bevestigen)");
      await expect(revertDialog).toBeHidden();
      await settle(page);
      story.finish();

      // The reservation view the revert was opened from shows the new state.
      await expect(viewDialog.getByTestId("button-start-pickup-calendar")).toBeVisible();
      await expect(viewDialog.getByTestId("button-revert-handover")).toHaveCount(0);

      // End state via the API, not the screen.
      const after = await (await request.get(`/api/reservations/${reservation.id}`)).json();
      expect(after.status).toBe("booked");
      expect(after.pickupMileage).toBeNull();
      expect(after.actualPickupDate).toBeNull();
      expect(after.contractNumber).toBeNull();
      const vehicleAfter = (await (await request.get("/api/vehicles")).json()).find((v: { id: number }) => v.id === vehicle.id);
      expect(vehicleAfter.currentMileage).toBe(20000);
      // Beschikbaar: the booking is in the past, nothing else covers today.
      expect(vehicleAfter.availabilityStatus).toBe("available");
      // The generated contract is not deleted, it is marked as expired.
      const documents = await (await request.get(`/api/documents/reservation/${reservation.id}`)).json();
      const contract = documents.find((d: { documentType: string }) => /^Contract \(Unsigned\)/.test(d.documentType));
      expect(contract, "the unsigned contract the pickup generated").toBeTruthy();
      expect(contract.isStale).toBe(true);

      expect(health.violations).toEqual([]);
    });
  });

  // The desk role (`user`) holds manage_reservations but NOT revert_handover:
  // the way back is still shown, greyed out and with the reason (B-27), and a
  // click opens nothing. This is the proof the registry cannot give from a bare
  // page load (deniedPathNeedsState in e2e/registry/dialogs.ts).
  test.describe("zonder het recht", () => {
    test.use({ storageState: authFile("user"), viewport: { width: 1280, height: 1400 } });

    test("de balie ziet de knop uitgeschakeld met de reden, en er opent niets", async ({ page, health, request }) => {
      const reservations = await (await request.get("/api/reservations")).json();
      const target = reservations.find((r: { notes?: string }) => r.notes === "e2e:picked-up");
      expect(target, "seeded reservation e2e:picked-up").toBeTruthy();

      const story = new Story("Overdracht terugdraaien zonder recht", 2);
      await page.goto("/");
      await settle(page);
      await story.click(page.getByRole("link", { name: "Reserveringen" }), "Reserveringen");
      await settle(page);
      await story.click(page.getByTestId("button-list-view"), "Reserveringen als lijst");
      const listDialog = page.getByTestId("dialog-reservation-list");
      await expect(listDialog).toBeVisible();

      const opener = listDialog.getByTestId(`button-revert-handover-${target.id}`);
      await expect(opener).toBeVisible();
      await expect(opener).toHaveAttribute("aria-disabled", "true");
      // Reading the reason, not an action of staff: the tooltip sits on the
      // wrapper around a disabled control (requires-permission.tsx).
      await opener.locator("xpath=..").focus();
      await expect(page.getByRole("tooltip")).toContainText("Overdracht terugdraaien");
      await opener.click({ force: true });
      await expect(page.getByTestId("dialog-revert-handover")).toHaveCount(0);
      story.finish();

      expect((await (await request.get(`/api/reservations/${target.id}`)).json()).status).toBe("picked_up");
      expect(health.violations).toEqual([]);
    });
  });
});
