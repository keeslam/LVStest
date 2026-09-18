import fs from "fs";
import { inArray, like } from "drizzle-orm";
import { db } from "../db";
import { expenses, invoiceInboxItems, vehicles } from "../../shared/schema";
import { resolveDocumentFilePath } from "../services/document-paths";
import { storage } from "../storage";
import { TEST_PREFIX } from "./portal-helpers";

/** `created_by` of every inbox item a test writes, so cleanup can find them. */
export const INBOX_TEST_ACTOR = `${TEST_PREFIX}inbox`;

/**
 * Removes what the inbox tests leave behind: items written by the test actor,
 * their stored attachments, the expenses on the `PT…` test vehicles (the
 * expenses table has no foreign key to vehicles, so cleanupPortalTestData()
 * would orphan them) and the notifications that mention the test prefix.
 * Call it BEFORE cleanupPortalTestData(), while the test vehicles still exist.
 */
export async function cleanupInboxTestData(): Promise<void> {
  const testVehicles = await db.select({ id: vehicles.id }).from(vehicles).where(like(vehicles.licensePlate, "PT%"));
  const vehicleIds = testVehicles.map((v) => v.id);
  if (vehicleIds.length) await db.delete(expenses).where(inArray(expenses.vehicleId, vehicleIds));

  const items = await db.select().from(invoiceInboxItems).where(like(invoiceInboxItems.createdBy, `${INBOX_TEST_ACTOR}%`));
  for (const item of items) {
    const abs = item.attachmentPath ? resolveDocumentFilePath(item.attachmentPath) : null;
    if (abs) fs.rmSync(abs, { force: true });
  }
  await db.delete(invoiceInboxItems).where(like(invoiceInboxItems.createdBy, `${INBOX_TEST_ACTOR}%`));

  const notes = await storage.getCustomNotificationsByType("invoice_inbox");
  for (const n of notes) {
    if (n.title.includes(TEST_PREFIX) || n.description.includes(TEST_PREFIX)) await storage.deleteCustomNotification(n.id);
  }
}
