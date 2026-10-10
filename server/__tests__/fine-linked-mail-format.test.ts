/**
 * A-12-7 (audit 2026-10-09): the mail that tells a customer about a fine wrote
 * "Bedrag € 95.00" and the date as 2026-10-01. Dutch notation (B-18): "€ 95,00" and 01-10-2026.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { db } from "../db";
import { customers } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { cleanupPortalTestData, createTestCustomer } from "./portal-helpers";
import { finesStorage } from "../services/fines-storage";
import { sendFineLinkedMail } from "../services/portal-mail";

describe("sendFineLinkedMail: Dutch amounts and dates", () => {
  let fineId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    const c = await createTestCustomer("FM");
    await db.update(customers).set({ email: "fm@portal-test.invalid" }).where(eq(customers.id, c.id));
    const fine = await finesStorage.createFine({
      licensePlate: "AB123C", offenceAt: new Date("2026-10-01T10:00:00Z"), description: "Te hard", amount: "95.00", adminFee: "12.50", totalAmount: "107.50",
      status: "linked", customerId: c.id,
    } as any);
    fineId = fine.id;
  });
  afterAll(cleanupPortalTestData);

  it("writes the amount with a decimal comma and the date as dd-mm-jjjj", async () => {
    await sendFineLinkedMail(fineId);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0] as { html: string; subject: string };
    expect(mail.html).toContain("€ 95,00");
    expect(mail.html).not.toContain("95.00");
    expect(mail.html).toContain("01-10-2026");
    expect(mail.subject).toContain("01-10-2026");
  });
});
