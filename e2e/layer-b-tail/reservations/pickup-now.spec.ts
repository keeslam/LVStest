/**
 * Sub-project D, D3 (besluiten B-41/B-42) - "Nu ophalen" after creating a reservation from the
 * dashboard's quick action, walked as `manager-b`.
 *
 * The quick action's dialog closes when the reservation is saved, so "Nu ophalen" is the action of
 * the success toast (12 s). It starts the pickup in the global dialog layer, which outlives the
 * dialog: the pickup dialog opens for the reservation that was just created (the spec compares the
 * id the server returned with the one the dialog fetched). The pickup is not completed: the spec
 * closes the dialog and cancels its own reservation, so nothing it made stays booked.
 *
 * Tail project (`layer-b-tail`, runs alone after layer A and B): the spec creates a reservation, and the desk
 * edge-case "dubbele boeking" compares the number of reservations before and after, so it must not run beside it.
 *
 * Account: `manager-b`, the twin of `manager` (own request bucket; the manager end-of-run figure is
 * already the highest of the three twins' partners, see docs/e2e/README.md "Het verzoekbudget").
 * Request cost: the spec counts its own `/api/` requests (the page's and its direct calls) and
 * prints them as "[verzoeken]"; the figure is recorded in docs/e2e/README.md.
 */
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";

test.use({ storageState: authFile("manager-b"), viewport: { width: 1280, height: 1400 } });

const PLATE = "E2E-PN-1";
const CUSTOMER_NAME = "E2E Pieter Bakker";

test("Nu ophalen in de toast na een reservering vanaf het dashboard opent het ophaalvenster van die reservering", async ({ page, health, request }) => {
  test.setTimeout(90_000);

  let apiRequests = 0;
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests += 1; });

  // Not counted: a car of its own, so the vehicle search shows exactly one card.
  const cookies = await page.context().cookies();
  const csrfToken = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
  expect(csrfToken, "XSRF-TOKEN cookie from storageState").toBeTruthy();
  const headers = { "X-CSRF-Token": csrfToken! };
  apiRequests += 1;
  const vehicleResponse = await request.post("/api/vehicles", {
    headers,
    data: { licensePlate: PLATE, brand: "Fiat", model: "Doblo", currentMileage: 31000 },
  });
  expect(vehicleResponse.ok(), await vehicleResponse.text()).toBeTruthy();

  let createdId: number | null = null;
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/reservations" && r.status() === 201) {
      createdId = (await r.json()).id;
    }
  });

  const story = new Story("Nu ophalen na een reservering vanaf het dashboard", 8);
  await page.goto("/");
  await settle(page);
  await story.click(page.getByTestId("button-quick-new-reservation"), "Nieuwe reservering (snelle actie)");

  const dialog = page.getByRole("dialog", { name: "Nieuwe reservering" });
  await expect(dialog).toBeVisible();
  await story.click(dialog.getByRole("button", { name: "Klant", exact: true }), "klant zoeken openen");
  await story.click(page.getByRole("option", { name: new RegExp(CUSTOMER_NAME) }), `klant ${CUSTOMER_NAME}`);
  await story.click(dialog.getByRole("button", { name: /Zoek en selecteer een voertuig/ }), "voertuig zoeken openen");
  await story.fill(page.getByPlaceholder("Zoek op kenteken, merk of model..."), PLATE, `zoek ${PLATE}`);
  await story.click(page.locator("div.rounded-md.border.cursor-pointer", { hasText: "E2EPN1" }), `voertuig ${PLATE}`);
  await story.click(dialog.getByTestId("button-submit-reservation"), "Reservering aanmaken");
  await expect(dialog).toBeHidden();

  // The dialog is gone; the toast carries the way into the handover.
  const toastAction = page.getByTestId("button-pickup-now");
  await expect(toastAction).toBeVisible();
  await story.click(toastAction, "Nu ophalen (in de melding)");

  const pickupDialog = page.getByRole("dialog", { name: "Ophaalproces starten" });
  await expect(pickupDialog).toBeVisible();
  story.finish();

  // The dialog belongs to the reservation that was just created.
  expect(createdId, "the id the server returned for the new reservation").not.toBeNull();
  await expect(pickupDialog).toContainText(PLATE);
  await expect(pickupDialog).toContainText(CUSTOMER_NAME);
  const stored = await (async () => { apiRequests += 1; return (await request.get(`/api/reservations/${createdId}`)).json(); })();
  expect(stored.status).toBe("booked");
  expect(stored.contractNumber ?? null).toBeNull();

  // Not counted: leave nothing booked behind.
  await page.keyboard.press("Escape");
  apiRequests += 1;
  const cancelled = await request.patch(`/api/reservations/${createdId}/status`, { headers, data: { status: "cancelled" } });
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();

  console.log(`[verzoeken] Nu ophalen na een reservering vanaf het dashboard (manager-b): ${apiRequests} /api/-verzoeken`);
  expect(health.violations).toEqual([]);
});
