/**
 * Sub-project D, D4 (besluiten B-41/B-42) - "Annuleren" in "Vervangende voertuigen toewijzen"
 * maakt het hele plannen ongedaan, walked as `manager` (the profile that may plan a block:
 * manage_reservations next to manage_maintenance).
 *
 * The seeded "picked-up" rental of E2E-03-C covers today, so planning maintenance on that car
 * today opens the spare-vehicle dialog (the block is saved first). Annuleren asks "Plannen
 * afbreken?"; confirming removes the block for good - no row, no recycle-bin line - and the
 * rental is untouched. Nothing is left behind, so the seeded state of the other specs holds.
 *
 * Request cost as `manager`: counted by the first run (see docs/e2e/README.md, "Het verzoekbudget").
 */
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";

test.use({ storageState: authFile("manager"), viewport: { width: 1280, height: 1400 } });

test("onderhoud plannen afbreken in het vervangersvenster: het blok verdwijnt echt, de huur blijft", async ({ page, health, request }) => {
  test.setTimeout(180_000);

  const vehicles = await (await request.get("/api/vehicles")).json();
  const vehicle = vehicles.find((v: { licensePlate: string }) => v.licensePlate === "E2E-03-C");
  expect(vehicle, "seeded vehicle E2E-03-C (e2e/seed/data.ts)").toBeTruthy();
  const blocksOf = async () => {
    const rows: Array<{ id: number; type: string; deletedAt: string | null }> = await (await request.get(`/api/reservations/vehicle/${vehicle.id}`)).json();
    return rows.filter((r) => r.type === "maintenance_block" && !r.deletedAt);
  };
  const before = await blocksOf();

  const story = new Story("Onderhoud plannen afbreken", 7);
  await page.goto("/maintenance");
  await settle(page);
  await story.click(page.getByTestId("button-schedule-maintenance"), "Onderhoud inplannen");
  const dialog = page.getByTestId("dialog-schedule-maintenance");
  await expect(dialog).toBeVisible();

  await story.click(dialog.getByTestId("select-vehicle").getByRole("button"), "voertuig zoeken openen");
  await story.fill(page.getByPlaceholder("Zoek op kenteken, merk of model..."), "E2E-03-C", "zoek E2E-03-C");
  await story.click(page.locator("div.rounded-md.border.cursor-pointer", { hasText: "E2E03C" }), "voertuig E2E-03-C");
  await story.click(dialog.getByTestId("button-schedule"), "Plannen");

  // The block exists already; the spare-vehicle dialog opens for the picked-up rental.
  await expect(page.getByTestId("button-assign-spare-vehicles")).toBeVisible();
  await story.click(page.getByTestId("button-cancel-spare-dialog"), "Annuleren");
  await expect(page.getByText("Plannen afbreken?")).toBeVisible();
  await story.click(page.getByTestId("button-confirm-abort-planning"), "Plannen afbreken bevestigen");
  await expect(page.getByTestId("button-assign-spare-vehicles")).toBeHidden();
  await settle(page);
  story.finish();

  // Not counted: the block is gone for good and the rental still stands.
  expect((await blocksOf()).map((b) => b.id)).toEqual(before.map((b) => b.id));
  const bin = await (await request.get("/api/deleted-records?type=maintenance_block")).json();
  expect(JSON.stringify(bin)).not.toContain(`"entityId":${(await blocksOf())[0]?.id ?? -1}`);
  expect(health.violations).toEqual([]);
});
