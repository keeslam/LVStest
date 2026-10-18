/**
 * The questions the pickup dialog asks after "Ophalen voltooien & contract genereren" must open ON TOP
 * of it. The pickup dialog's content sits at z-[60]; its follow-up dialogs ("De huur start eerder",
 * "Dubbel contractnummer", "Uitgifte geblokkeerd") used the default z-50 and rendered behind it, so staff
 * saw only a darker screen (found while photographing the user manual, 18 October 2026).
 *
 * Playwright's own checks do not catch this: while the question is open, Radix makes the rest of the page
 * ignore the pointer, so a click "through" the pickup dialog still reaches the hidden button. The spec
 * therefore compares the two dialogs' stacking order directly.
 *
 * Walked as `manager-b` on the scan path, with a vehicle, customer and reservation of its own (start in
 * three days, so the server asks whether the rental starts earlier). The answer is "Nee, niet ophalen",
 * and the reservation is cancelled afterwards, so nothing it made stays booked.
 */
import { test, expect, settle, type Violation } from "../../support/guards";
import { authFile } from "../../support/roles";

test.use({ storageState: authFile("manager-b"), viewport: { width: 1280, height: 1100 } });

const PLATE = "E2E-ZL-1";

/** The server's 409 PICKUP_BEFORE_START_DATE is the question's trigger, not a fault: drop exactly that console line. */
function consumeExpected(health: { violations: Violation[] }, kind: Violation["kind"], pattern: RegExp) {
  const index = health.violations.findIndex((v) => v.kind === kind && pattern.test(v.detail));
  expect(index, `expected a ${kind} violation matching ${pattern}`).toBeGreaterThanOrEqual(0);
  health.violations.splice(index, 1);
}

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test("De vraag 'De huur start eerder' opent boven het ophaalvenster", async ({ page, health, request }) => {
  test.setTimeout(90_000);
  const cookies = await page.context().cookies();
  const csrfToken = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
  expect(csrfToken, "XSRF-TOKEN cookie from storageState").toBeTruthy();
  const headers = { "X-CSRF-Token": csrfToken! };

  const vehicle = await request.post("/api/vehicles", { headers, data: { licensePlate: PLATE, brand: "Fiat", model: "Scudo", currentMileage: 12000 } });
  expect(vehicle.ok(), await vehicle.text()).toBeTruthy();
  const vehicleId = (await vehicle.json()).id;
  const customer = await request.post("/api/customers", { headers, data: { name: "E2E Laagtest Klant", customerType: "business" } });
  expect(customer.ok(), await customer.text()).toBeTruthy();
  const customerId = (await customer.json()).id;
  const reservation = await request.post("/api/reservations", {
    headers,
    data: { vehicleId, customerId, startDate: inDays(3), endDate: inDays(5), status: "booked", type: "standard", totalPrice: "150" },
  });
  expect(reservation.ok(), await reservation.text()).toBeTruthy();
  const reservationId = (await reservation.json()).id;

  await page.goto("/scan");
  await settle(page);
  const scanField = page.getByRole("textbox", { name: /Scan of typ een barcode/ });
  await scanField.fill(PLATE);
  await scanField.press("Enter");
  await settle(page);
  await page.getByRole("button", { name: "Ophalen starten" }).first().click();

  const pickup = page.getByRole("dialog", { name: "Ophaalproces starten" });
  await expect(pickup).toBeVisible();
  const remarks = page.getByRole("alertdialog", { name: /Voertuigopmerkingen/ });
  if (await remarks.isVisible().catch(() => false)) await remarks.getByRole("button", { name: /Ik bevestig/ }).click();
  await pickup.getByRole("button", { name: /Ophalen voltooien/ }).click();

  const early = page.getByTestId("confirm-dialog");
  await expect(early).toBeVisible();
  await expect(early.getByTestId("confirm-dialog-title")).toHaveText("De huur start eerder — datum aanpassen?");
  consumeExpected(health, "console", /responded with a status of 409/);
  // While the question is open, Radix hides the rest from the accessibility tree: find the pickup dialog by CSS.
  const pickupBox = page.locator('div[role="dialog"]').filter({ hasText: "Ophaalproces starten" }).last();
  const layer = async (locator: typeof early) => Number(await locator.evaluate((el) => getComputedStyle(el).zIndex));
  const pickupLayer = await layer(pickupBox);
  const earlyLayer = await layer(early);
  expect(earlyLayer, `question at z-index ${earlyLayer}, pickup dialog at ${pickupLayer}`).toBeGreaterThan(pickupLayer);

  await early.getByTestId("confirm-dialog-cancel").click();
  await expect(early).toBeHidden();
  await expect(pickup).toBeVisible();
  const stored = await (await request.get(`/api/reservations/${reservationId}`)).json();
  expect(stored.status).toBe("booked");

  await page.keyboard.press("Escape");
  const cancelled = await request.patch(`/api/reservations/${reservationId}/status`, { headers, data: { status: "cancelled" } });
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  expect(health.violations).toEqual([]);
});
