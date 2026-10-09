/**
 * Sub-project C, task 8 (besluit B-37) - "Onderhoud afronden" in one action, walked as the
 * `maintenance` profile: manage_maintenance, view_vehicles/manage_vehicles, view_reservations,
 * view_documents - and deliberately NOT manage_documents. Before B-37 the dialog uploaded the
 * APK form to POST /api/documents (needs manage_documents) and patched the vehicle with
 * PATCH /api/vehicles/:id; this profile could not have finished the upload. Now one request
 * does everything and the server writes it in one transaction.
 *
 *   1. Complete a planned block with an APK date, a new odometer reading and a small PDF:
 *      the block closes, the vehicle shows the new APK date, reading and last service, the
 *      PDF is a document of the vehicle AND the block and can be read back, and the car is
 *      rentable again.
 *   2. A reading below the vehicle's current one: the server refuses (400
 *      MILEAGE_LOWER_THAN_CURRENT), the dialog says which numbers it compared and stays open,
 *      nothing was saved - and the corrected reading then goes through.
 *
 * The blocks are planned on two SEEDED vehicles, E2E-06-F and E2E-07-G, never on a vehicle of
 * this spec's own: the vehicles list pages by ten and the desk story "Voertuig toevoegen"
 * (rental-story.spec.ts) expects its new vehicle on the first page - eight seeded vehicles
 * plus two made here pushed it to page two, on the first run of this spec. Both vehicles are
 * free in layer B (only the tail specs, which run after it, use them) and both are left
 * rentable again: a completed story ends with the workshop flag cleared.
 *
 * The block and the workshop flag are made through the API of `admin-b` (the twin of admin, own
 * request bucket): the `maintenance` profile cannot plan a block itself (that needs
 * manage_reservations, see button-schedule-maintenance in the registry), and every request it
 * does not spend on fixtures stays free for the stories - the account is at ~550 of 1000
 * requests when the layers before it are done (docs/e2e/README.md, "Het verzoekbudget").
 * Everything the stories are about - opening the block, filling in the dialog, completing -
 * goes through the page.
 *
 * Request cost as `maintenance` (measured, 9 Oct 2026): 27 `/api/` requests for the first story,
 * 28 for the second (a page load of the calendar, the dialog's own requests, a few read-backs).
 */
import { request as newApiRequestContext, type APIRequestContext, type Page } from "@playwright/test";
import { test, expect, settle, type Violation } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { E2E } from "../../support/env";
import { officeDay } from "../../seed/data";

test.use({ storageState: authFile("maintenance"), viewport: { width: 1280, height: 1400 } });

/** A few bytes that pass the upload check for a PDF (magic bytes) and weigh nothing. */
const SMALL_PDF = Buffer.from(
  "%PDF-1.4\n% E2E APK keuring\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
  "trailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
);

function consumeExpected(health: { violations: Violation[] }, kind: Violation["kind"], pattern: RegExp) {
  const index = health.violations.findIndex((v) => v.kind === kind && pattern.test(v.detail));
  expect(index, `expected a "${kind}" violation matching ${pattern}`).toBeGreaterThanOrEqual(0);
  health.violations.splice(index, 1);
}

interface Fixture { vehicleId: number; blockId: number; mileage: number }

/**
 * Not a Story action: a block planned for today on a seeded vehicle, which is flagged as in the
 * workshop - as the desk would have left it.
 */
async function plannedBlock(plate: string): Promise<Fixture> {
  const api: APIRequestContext = await newApiRequestContext.newContext({ baseURL: E2E.baseUrl, storageState: authFile("admin-b") });
  try {
    const { cookies } = await api.storageState();
    const csrf = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
    expect(csrf, "XSRF-TOKEN cookie in the admin-b storage state").toBeTruthy();
    const headers = { "X-CSRF-Token": csrf! };

    const vehicles = await (await api.get("/api/vehicles")).json();
    const vehicle = vehicles.find((v: { licensePlate: string }) => v.licensePlate === plate);
    expect(vehicle, `seeded vehicle ${plate} (e2e/seed/data.ts)`).toBeTruthy();
    expect(vehicle.currentMileage, "a seeded reading").toBeGreaterThan(1000);

    const blockResponse = await api.post("/api/reservations", {
      headers,
      data: {
        vehicleId: vehicle.id, customerId: null, startDate: officeDay(0), endDate: officeDay(0),
        status: "scheduled", type: "maintenance_block", notes: "regular_maintenance: jaarlijkse beurt",
        totalPrice: 0, maintenanceDuration: 1, maintenanceStatus: "scheduled",
      },
    });
    expect(blockResponse.status(), await blockResponse.text()).toBe(201);
    const block = await blockResponse.json();

    // The car is in the workshop: the flag the completion has to clear.
    const flagged = await api.patch(`/api/vehicles/${vehicle.id}`, { headers, data: { availabilityStatus: "needs_fixing" } });
    expect(flagged.ok(), await flagged.text()).toBeTruthy();
    return { vehicleId: vehicle.id, blockId: block.id, mileage: vehicle.currentMileage };
  } finally {
    await api.dispose();
  }
}

async function openCompletionDialog(page: Page, story: Story, blockId: number) {
  await page.goto("/maintenance");
  await settle(page);
  // The card sits inside its day cell: a click on it opens the day dialog.
  await story.click(page.getByTestId(`event-scheduled_maintenance_${blockId}-scheduled_maintenance`), "het blok in de kalender");
  await story.click(page.getByTestId(`button-complete-scheduled_maintenance_${blockId}`), "Afronden");
  const dialog = page.getByTestId("dialog-complete-maintenance");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("onderhoud afronden met APK-datum, kilometerstand en APK-formulier: één handeling, alles opgeslagen", async ({ page, health, request }) => {
  test.setTimeout(180_000);
  const { vehicleId, blockId, mileage } = await plannedBlock("E2E-06-F");
  const newApkDate = officeDay(365);
  const newMileage = mileage + 1500;

  const story = new Story("Onderhoud afronden met APK-keuring", 6);
  const dialog = await openCompletionDialog(page, story, blockId);
  // Pre-filled with what the vehicle has, not counted.
  await expect(dialog.getByTestId("input-current-mileage")).toHaveValue(String(mileage));

  await story.fill(dialog.getByTestId("input-apk-date"), newApkDate, "APK-datum");
  await story.fill(dialog.getByTestId("input-current-mileage"), String(newMileage), "kilometerstand");
  await story.upload(dialog.getByTestId("input-apk-form"), { name: "apk-keuring.pdf", mimeType: "application/pdf", buffer: SMALL_PDF }, "APK-formulier");
  await expect(dialog).toContainText("apk-keuring.pdf");

  // The whole completion is ONE request: nothing goes to the documents or vehicles routes.
  const sent: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" || r.method() === "PATCH") sent.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await story.click(dialog.getByTestId("button-complete-maintenance"), "Afronden bevestigen");
  await expect(dialog).toBeHidden();
  await settle(page);
  story.finish();
  expect(sent).toEqual([`POST /api/reservations/${blockId}/complete-maintenance`]);
  // The block left the calendar's open events.
  await expect(page.getByTestId(`event-scheduled_maintenance_${blockId}-scheduled_maintenance`)).toHaveCount(0);

  // Not counted: read it back the way another member of staff would.
  const block = await (await request.get(`/api/reservations/${blockId}`)).json();
  expect(block.status).toBe("completed");
  expect(block.maintenanceStatus).toBe("out");

  const vehicle = await (await request.get(`/api/vehicles/${vehicleId}`)).json();
  expect(vehicle.apkDate).toBe(newApkDate);
  expect(vehicle.currentMileage).toBe(newMileage);
  // The default category of the dialog is a scheduled service.
  expect(vehicle.lastServiceDate).toBe(officeDay(0));
  expect(vehicle.lastServiceMileage).toBe(newMileage);
  expect(vehicle.maintenanceStatus).toBe("ok");
  expect(vehicle.availabilityStatus).toBe("available");

  const documents = await (await request.get(`/api/documents/vehicle/${vehicleId}`)).json();
  const apk = documents.find((d: { documentType: string }) => d.documentType === "APK Inspection");
  expect(apk, "an APK Inspection document of the vehicle").toBeTruthy();
  expect(apk.reservationId).toBe(blockId);
  const file = await request.get(`/api/documents/view/${apk.id}`);
  expect(file.ok(), await file.text().catch(() => "")).toBeTruthy();
  expect((await file.body()).subarray(0, 5).toString("utf8")).toBe("%PDF-");

  expect(health.violations).toEqual([]);
});

test("een lagere kilometerstand dan die van het voertuig: geweigerd, het venster blijft open, niets opgeslagen", async ({ page, health, request }) => {
  test.setTimeout(180_000);
  const { vehicleId, blockId, mileage } = await plannedBlock("E2E-07-G");
  const tooLow = mileage - 1000;
  const corrected = mileage + 250;

  const story = new Story("Onderhoud afronden met te lage kilometerstand", 6);
  const dialog = await openCompletionDialog(page, story, blockId);

  await story.fill(dialog.getByTestId("input-current-mileage"), String(tooLow), "kilometerstand (te laag)");
  await story.click(dialog.getByTestId("button-complete-maintenance"), "Afronden bevestigen");

  // The server names the numbers it compared; the dialog is still there with what was typed.
  const toast = page.locator("li.destructive");
  await expect(toast).toContainText(`${tooLow.toLocaleString("nl-NL")} km`);
  await expect(toast).toContainText(`${mileage.toLocaleString("nl-NL")} km`);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("input-current-mileage")).toHaveValue(String(tooLow));
  consumeExpected(health, "console", /responded with a status of 400/);
  consumeExpected(health, "console", /Failed to complete maintenance/);
  consumeExpected(health, "toast", /lager dan de huidige stand/);

  // Not counted: nothing changed anywhere.
  const open = await (await request.get(`/api/reservations/${blockId}`)).json();
  expect(open.status).toBe("booked");
  expect(open.maintenanceStatus).toBe("scheduled");
  const untouched = await (await request.get(`/api/vehicles/${vehicleId}`)).json();
  expect(untouched.currentMileage).toBe(mileage);
  expect(untouched.availabilityStatus).toBe("needs_fixing");
  const documents: Array<{ documentType: string }> = await (await request.get(`/api/documents/vehicle/${vehicleId}`)).json();
  expect(documents.filter((d) => d.documentType === "APK Inspection")).toEqual([]);

  // The corrected reading goes through.
  await story.fill(dialog.getByTestId("input-current-mileage"), String(corrected), "kilometerstand (gecorrigeerd)");
  await story.click(dialog.getByTestId("button-complete-maintenance"), "Afronden bevestigen");
  await expect(dialog).toBeHidden();
  await settle(page);
  story.finish();

  const done = await (await request.get(`/api/vehicles/${vehicleId}`)).json();
  expect(done.currentMileage).toBe(corrected);
  expect(done.availabilityStatus).toBe("available");
});
