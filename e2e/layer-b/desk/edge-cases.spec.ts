/**
 * Edge cases staff already hit, walked as the desk profile (`user`). Each
 * test stands alone (its own reservation, its own health watcher) so one
 * fault does not hide the others. Every page interaction still goes through
 * `Story`, same as rental-story.spec.ts; budgets here are just this test's
 * own measured count (there is no "approved flow" for an edge case to stay
 * under — the point is reproducing it, not shrinking it).
 *
 * Two of these deliberately provoke a non-2xx response. Chrome logs every
 * response >= 400 as its own console error regardless of how gracefully the
 * app handles it (see guards.ts); `consumeExpected` removes exactly that one
 * expected entry (and, where the app also raises a destructive toast for it,
 * that entry too) so `health`'s teardown still fails on anything else.
 */
import { test, expect, settle, type Violation } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";

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
