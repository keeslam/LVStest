/**
 * WAVE 15 item 1 — besluit **B-06**, the mail half.
 *
 * B-06 says "telkens een portaalmelding **plus e-mail**". The sibling file
 * asserts the portal notification; this one asserts what actually leaves the
 * machine, against the raw-TCP SMTP stub (remediation plan §8.5) rather than a
 * mocked transport — that is the only way to see the real subject line and the
 * real body, and BUG-155 is precisely the class of defect where everything
 * looks sent and nothing is.
 *
 * B-18: Dutch, `dd-mm-jjjj`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { customers, reservations, type Reservation } from "../../shared/schema";
import { storage } from "../storage";
import { portalStorage } from "../services/portal-storage";
import { onReservationChangedByStaff, onDocumentAvailable } from "../services/portal-reservation-events";
import { withSmtpStub, decodeBody, type CapturedMessage } from "./helpers/smtpStub";
import {
  createTestCustomer, createTestVehicle, createTestReservation, createTestDocument,
  cleanupPortalTestData, TEST_EMAIL_DOMAIN,
} from "./portal-helpers";

let customerId: number, vehicleId: number, otherVehicleId: number, customerEmail: string;

beforeAll(async () => {
  await cleanupPortalTestData();
  customerId = (await createTestCustomer("B06Mail")).id;
  customerEmail = `b06mail-${customerId}@${TEST_EMAIL_DOMAIN}`;
  await db.update(customers).set({ email: customerEmail }).where(eq(customers.id, customerId));
  await portalStorage.createPortalUser(
    { customerId, email: `login-${customerId}@${TEST_EMAIL_DOMAIN}`, fullName: "Klant B06", role: "admin" }, "t",
  );
  vehicleId = (await createTestVehicle()).id;
  otherVehicleId = (await createTestVehicle()).id;
}, 60_000);

afterAll(cleanupPortalTestData);

const rental = async (patch: Partial<Reservation> = {}): Promise<Reservation> => {
  const row = await createTestReservation({
    customerId, vehicleId, startDate: "2026-10-10", endDate: "2026-10-15", status: "booked",
  });
  if (Object.keys(patch).length) await db.update(reservations).set(patch).where(eq(reservations.id, row.id));
  return (await storage.getReservation(row.id))!;
};

/** The address in a captured `RCPT TO:<addr>` line. */
const addressOf = (rcpt: string): string => {
  const m = /<([^>]+)>/.exec(rcpt);
  return (m ? m[1] : rcpt).trim().toLowerCase();
};

describe("B-06 — wat de klant werkelijk in zijn mailbox krijgt", () => {
  it("gewijzigde datums: onderwerp, ontvanger en de Nederlandse periode in de tekst", async () => {
    const before = await rental();
    const after = { ...before, startDate: "2026-10-12", endDate: "2026-10-17" };

    const sent = await withSmtpStub("ok", async (stub) => {
      expect(await onReservationChangedByStaff(before, after)).toBe("reservation_changed");
      return stub.state.messages as CapturedMessage[];
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].rcptTo.map(addressOf)).toEqual([customerEmail.toLowerCase()]);
    expect(sent[0].subject).toContain("Uw reservering is gewijzigd");
    const body = decodeBody(sent[0].raw);
    expect(body).toContain("Lam Groep heeft uw reservering aangepast.");
    expect(body).toContain("12-10-2026");
    expect(body).toContain("17-10-2026");
    expect(body).not.toContain("2026-10-12");
  }, 40_000);

  it("geannuleerd: onderwerp en eerste regel", async () => {
    const before = await rental();

    const sent = await withSmtpStub("ok", async (stub) => {
      expect(await onReservationChangedByStaff(before, { ...before, status: "cancelled" })).toBe("reservation_cancelled");
      return stub.state.messages as CapturedMessage[];
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("Uw reservering is geannuleerd");
    const body = decodeBody(sent[0].raw);
    expect(body).toContain("Lam Groep heeft uw reservering geannuleerd.");
    expect(body).toContain("10-10-2026");
  }, 40_000);

  it("nieuw document: onderwerp noemt het document, de tekst wijst naar het portaal", async () => {
    const row = await rental({ vehicleId: otherVehicleId });
    const doc = await createTestDocument({
      reservationId: row.id, vehicleId: otherVehicleId,
      documentType: "Contract (Unsigned)", fileName: "contract-mail.pdf",
    });

    const sent = await withSmtpStub("ok", async (stub) => {
      expect(await onDocumentAvailable(doc)).toBe(true);
      return stub.state.messages as CapturedMessage[];
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("Nieuw document beschikbaar");
    expect(sent[0].subject).toContain("Huurcontract");
    const body = decodeBody(sent[0].raw);
    expect(body).toContain("Er staat een nieuw document voor u klaar in het klantenportaal");
    expect(body).toContain("contract-mail.pdf");
  }, 40_000);

  it("een zwijgende mailserver laat de melding staan en gooit niets terug (BUG-155)", async () => {
    const before = await rental();
    const started = Date.now();

    const sent = await withSmtpStub("silent", async (stub) => {
      // The in-app notification is the record that stands; a mail server that
      // never answers may not undo a staff action, and may not hang the request.
      expect(await onReservationChangedByStaff(before, { ...before, status: "cancelled" })).toBe("reservation_cancelled");
      return stub.state.messages as CapturedMessage[];
    });

    expect(sent).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);
});
