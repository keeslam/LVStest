/**
 * Sub-project C, task 7 (besluiten B-36, B-38, B-39) - the recycle bins walked end to
 * end as `manager-b`, the twin of `manager` (the profile that holds `manage_recycle_bin` besides admin):
 *
 *   1. a reservation is deleted through the reservations list; it lands in the bin of
 *      Reserveringen (and in no other bin) and "Terugzetten" brings it back;
 *   2. a customer with a debtor number is deleted through the customers table; it lands
 *      in the bin of Klanten, the number is reserved while it sits there, and
 *      "Definitief verwijderen" (one row, one confirmation) removes it - after which the
 *      same debtor number can be given to a new customer;
 *   3. a selection of two rows is emptied with one confirmation naming the count and the
 *      kind, and "Prullenbak leegmaken" asks first - cancelling it removes nothing.
 *
 * Fixtures are made through the API the way the app itself would have produced them (a
 * member of staff would never click through a form to make a throw-away customer for a
 * bin). Every deletion, restore and purge that this spec is about goes through the page.
 *
 * Runs in the tail project (alone, after layer-a and layer-b): the bins are shared
 * state, and layer-b stories (the debtor-number one) leave rows in them. Nothing here
 * assumes an empty bin - rows are found by the id the API reports, and the "empty it"
 * button is only ever cancelled.
 *
 * `manager-b`, not `admin` and not `manager`: all three hold the right, but admin and
 * manager are the accounts layer-a and layer-b spend their apiLimiter budget on, and
 * manager-b is the twin of manager (same rights, own bucket). The tail deals its specs
 * over the two: template-errors runs as `manager`, this one and past-reservation as
 * `manager-b` (docs/e2e/README.md, "Het verzoekbudget").
 */
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { officeDay } from "../../seed/data";
import type { APIRequestContext, Page } from "@playwright/test";

const PLATE = "E2E-PB-1";

test.use({ storageState: authFile("manager-b"), viewport: { width: 1280, height: 1400 } });

/**
 * The double-submit CSRF cookie the app's own client echoes back on every mutating
 * request (server/middleware/security/csrf.ts); already in the browser context from
 * `storageState`.
 */
async function csrfHeaders(page: Page) {
  const cookies = await page.context().cookies();
  const token = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
  expect(token, "XSRF-TOKEN cookie from storageState").toBeTruthy();
  return { "X-CSRF-Token": token! };
}

interface BinRow { id: number; entityType: string; entityId: number; label: string; restoredAt: string | null }

async function binRows(request: APIRequestContext, kind: string): Promise<BinRow[]> {
  const response = await request.get(`/api/deleted-records?type=${kind}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function createCustomer(request: APIRequestContext, headers: Record<string, string>, name: string, extra: Record<string, unknown> = {}) {
  const response = await request.post("/api/customers", { headers, data: { name, customerType: "private", ...extra } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: number; name: string };
}

test.describe("Prullenbakken (B-36, B-38)", () => {
  test("reservering: verwijderen via de lijst, alleen in de prullenbak van Reserveringen, terugzetten haalt hem terug", async ({ page, health, request }) => {
    test.setTimeout(180_000);
    const headers = await csrfHeaders(page);

    // Not counted: a vehicle of its own, a customer, and a booking next week.
    const vehicleResponse = await request.post("/api/vehicles", { headers, data: { licensePlate: PLATE, brand: "Fiat", model: "Doblo", currentMileage: 12000 } });
    expect(vehicleResponse.ok(), await vehicleResponse.text()).toBeTruthy();
    const vehicle = await vehicleResponse.json();
    const customer = await createCustomer(request, headers, "E2E Prullenbak Reservering");
    const reservationResponse = await request.post("/api/reservations", {
      headers, data: { customerId: customer.id, vehicleId: vehicle.id, startDate: officeDay(14), endDate: officeDay(17), type: "standard" },
    });
    expect(reservationResponse.status(), await reservationResponse.text()).toBe(201);
    const reservation = await reservationResponse.json();

    const story = new Story("Reservering verwijderen en terugzetten", 7);
    await page.goto("/reservations");
    await settle(page);
    await story.click(page.getByTestId("button-list-view"), "Reserveringen als lijst");
    const list = page.getByTestId("dialog-reservation-list");
    await expect(list).toBeVisible();
    await story.fill(list.getByTestId("input-current-search"), "Prullenbak Reservering", "zoek op klant");
    await story.click(list.getByTestId(`delete-btn-${reservation.id}`), "verwijderen");
    const confirmDelete = page.getByTestId("confirm-dialog");
    await expect(confirmDelete).toBeVisible();
    // The text no longer says "permanent": it goes to the bin, and the bin can bring it back.
    await expect(confirmDelete).toContainText("prullenbak");
    await story.click(confirmDelete.getByTestId("confirm-dialog-confirm"), "verwijderen bevestigen");
    await expect(list.getByTestId(`reservation-card-${reservation.id}`)).toHaveCount(0);
    expect((await request.get(`/api/reservations/${reservation.id}`)).status(), "soft-deleted rows are not served").toBe(404);

    // Not counted: it is in the bin of its own kind and in no other.
    const mine = (await binRows(request, "reservation")).find((row) => row.entityId === reservation.id);
    expect(mine, "bin row of the reservation").toBeTruthy();
    expect(mine!.label).toContain(`Reservering #${reservation.id}`);
    expect((await binRows(request, "customer")).some((row) => row.label.includes("E2E Prullenbak Reservering"))).toBe(false);
    expect((await binRows(request, "maintenance_block")).some((row) => row.entityId === reservation.id)).toBe(false);

    await story.click(list.getByRole("button", { name: "Sluiten" }).first(), "lijst sluiten");
    await expect(list).toBeHidden();
    await story.click(page.getByTestId("button-open-recycle-bin-reservations"), "prullenbak reserveringen");
    const bin = page.getByTestId("dialog-recycle-bin");
    await expect(bin).toBeVisible();
    await expect(bin).toHaveAttribute("data-kind", "reservation");
    const row = bin.getByTestId(`deleted-record-${mine!.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(`Reservering #${reservation.id}`);
    await expect(row.getByTestId(`deleted-record-type-${mine!.id}`)).toHaveText("Reservering");

    await story.click(row.getByTestId(`button-restore-${mine!.id}`), "terugzetten");
    await expect(row).toContainText("Teruggezet");
    story.finish();

    const back = await request.get(`/api/reservations/${reservation.id}`);
    expect(back.status()).toBe(200);
    expect((await back.json()).status).toBe("booked");
    expect(health.violations).toEqual([]);
  });

  test("klant: verwijderen, het debiteurnummer blijft gereserveerd, definitief verwijderen maakt het weer vrij", async ({ page, health, request }) => {
    test.setTimeout(180_000);
    const headers = await csrfHeaders(page);
    const name = "E2E Prullenbak Klant Weg";
    const debtorNumber = "PB-E2E-1";
    const customer = await createCustomer(request, headers, name, { debtorNumber });

    const story = new Story("Klant verwijderen en definitief verwijderen", 7);
    await page.goto("/customers");
    await settle(page);
    await story.fill(page.getByTestId("input-search-customers"), name, "klant zoeken");
    await story.click(page.getByTestId(`button-delete-customer-${customer.id}`), "klant verwijderen");
    await story.fill(page.getByTestId(`input-confirm-delete-${customer.id}`), name, "naam overtypen");
    await story.click(page.getByTestId(`button-confirm-delete-${customer.id}`), "verwijderen bevestigen");
    await settle(page);

    // Not counted: in the bin of Klanten only, and the number is reserved while it sits there.
    const mine = (await binRows(request, "customer")).find((row) => row.entityId === customer.id);
    expect(mine, "bin row of the customer").toBeTruthy();
    expect((await binRows(request, "reservation")).some((row) => row.label.includes(name))).toBe(false);
    const blocked = await request.post("/api/customers", { headers, data: { name: "E2E Prullenbak Nieuw", customerType: "private", debtorNumber } });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).code).toBe("DEBTOR_NUMBER_IN_RECYCLE_BIN");

    await story.click(page.getByTestId("button-open-recycle-bin-customers"), "prullenbak klanten");
    const bin = page.getByTestId("dialog-recycle-bin");
    await expect(bin).toHaveAttribute("data-kind", "customer");
    const row = bin.getByTestId(`deleted-record-${mine!.id}`);
    await expect(row).toContainText(name);

    await story.click(row.getByTestId(`button-purge-${mine!.id}`), "definitief verwijderen");
    const confirm = page.getByTestId("dialog-confirm-purge");
    await expect(confirm).toBeVisible();
    // Names the record and says there is no way back; nothing has been removed yet.
    await expect(confirm).toContainText(name);
    await expect(confirm).toContainText("niet ongedaan");
    expect((await binRows(request, "customer")).some((r) => r.id === mine!.id)).toBe(true);
    await story.click(confirm.getByTestId("button-confirm-purge"), "definitief verwijderen bevestigen");
    await expect(confirm).toBeHidden();
    await expect(row).toHaveCount(0);
    story.finish();

    // Gone for good: not in the bin, not among the customers - and the number is free again.
    expect((await binRows(request, "customer")).some((r) => r.id === mine!.id)).toBe(false);
    expect((await request.get(`/api/customers/${customer.id}`)).status()).toBe(404);
    const reused = await request.post("/api/customers", { headers, data: { name: "E2E Prullenbak Nieuw", customerType: "private", debtorNumber } });
    expect(reused.status(), await reused.text()).toBe(201);
    expect((await reused.json()).debtorNumber).toBe(debtorNumber);
    expect(health.violations).toEqual([]);
  });

  test("selectie leegmaken met één bevestiging die aantal en soort noemt; 'Prullenbak leegmaken' vraagt eerst en annuleren verwijdert niets", async ({ page, health, request }) => {
    test.setTimeout(180_000);
    const headers = await csrfHeaders(page);

    // Not counted: three customers deleted straight away, as the delete dialog would have.
    const ids: number[] = [];
    for (const label of ["Een", "Twee", "Drie"]) {
      const customer = await createCustomer(request, headers, `E2E Prullenbak Bulk ${label}`);
      expect((await request.delete(`/api/customers/${customer.id}`, { headers })).status()).toBe(204);
      ids.push(customer.id);
    }
    const binIds = new Map<number, number>();
    for (const row of await binRows(request, "customer")) binIds.set(row.entityId, row.id);
    const [first, second, third] = ids.map((id) => binIds.get(id)!);
    expect([first, second, third].every(Boolean), "three bin rows").toBe(true);

    const story = new Story("Selectie uit de prullenbak verwijderen", 7);
    await page.goto("/customers");
    await settle(page);
    await story.click(page.getByTestId("button-open-recycle-bin-customers"), "prullenbak klanten");
    const bin = page.getByTestId("dialog-recycle-bin");
    await expect(bin.getByTestId(`deleted-record-${first}`)).toBeVisible();
    await expect(bin.getByTestId("button-purge-selected")).toBeDisabled();

    await story.click(bin.getByTestId(`checkbox-deleted-record-${first}`), "rij 1 aanvinken");
    await story.click(bin.getByTestId(`checkbox-deleted-record-${second}`), "rij 2 aanvinken");
    await story.click(bin.getByTestId("button-purge-selected"), "geselecteerde verwijderen");
    const confirm = page.getByTestId("dialog-confirm-purge");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("2 klanten");
    await expect(confirm).toContainText("niet ongedaan");
    await story.click(confirm.getByTestId("button-confirm-purge"), "definitief verwijderen bevestigen");
    await expect(confirm).toBeHidden();
    await expect(bin.getByTestId(`deleted-record-${first}`)).toHaveCount(0);
    await expect(bin.getByTestId(`deleted-record-${second}`)).toHaveCount(0);
    // The third row was never ticked.
    await expect(bin.getByTestId(`deleted-record-${third}`)).toBeVisible();

    // "Prullenbak leegmaken" asks first, naming the kind; cancelling removes nothing.
    await story.click(bin.getByTestId("button-purge-all"), "prullenbak leegmaken");
    const confirmAll = page.getByTestId("dialog-confirm-purge");
    await expect(confirmAll).toBeVisible();
    await expect(confirmAll).toContainText("klant");
    await story.click(confirmAll.getByTestId("button-cancel-purge"), "annuleren");
    await expect(confirmAll).toBeHidden();
    story.finish();

    const after = await binRows(request, "customer");
    expect(after.some((r) => r.id === first || r.id === second)).toBe(false);
    expect(after.some((r) => r.id === third)).toBe(true);
    expect(health.violations).toEqual([]);
  });
});
