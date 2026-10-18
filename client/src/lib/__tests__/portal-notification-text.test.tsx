/**
 * The portal words a notification in the language it is shown in (Kees, 2026-10-18). A notice
 * without params, from before this existed, keeps its stored Dutch text.
 */
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import type { PortalNotificationDto } from "@shared/portal-types";
import { portalNotificationText } from "@/lib/portal-notification-text";

afterEach(async () => { await i18n.changeLanguage("nl"); });

const word = (n: Partial<PortalNotificationDto>) => {
  const t = i18n.getFixedT(null, "portal");
  return portalNotificationText(
    { id: 1, type: "x", title: "Opgeslagen titel", description: "Opgeslagen tekst", params: null, link: null, isRead: false, createdAt: "2026-10-18T10:00:00Z", ...n },
    t, (key) => i18n.exists(key, { ns: "portal" }),
  );
};

describe("portal notification text", () => {
  it("keeps the stored text of a notice without params", async () => {
    await i18n.changeLanguage("es");
    expect(word({ type: "maintenance_planned" })).toEqual({ title: "Opgeslagen titel", description: "Opgeslagen tekst" });
  });

  it("keeps the stored text of a kind the portal has no wording for", async () => {
    await i18n.changeLanguage("es");
    expect(word({ type: "fiscal_data_missing", params: { plate: "AB-123-C" } }).title).toBe("Opgeslagen titel");
  });

  it("words maintenance with a date range in the reader's language", async () => {
    await i18n.changeLanguage("es");
    const text = word({ type: "maintenance_planned", params: { plate: "AB-123-C", car: "Volkswagen Caddy", date: "2026-10-12", endDate: "2026-10-14", company: "Lam Groep" } });
    expect(text.title).toBe("Mantenimiento programado: AB-123-C");
    expect(text.description).toBe("Volkswagen Caddy (AB-123-C) tiene programado un mantenimiento del 12/10/2026 al 14/10/2026, ambos inclusive. Lleve el vehículo a Lam Groep el día acordado.");
  });

  it("reads the same in Dutch as the stored text did", async () => {
    await i18n.changeLanguage("nl");
    const text = word({ type: "maintenance_planned", params: { plate: "AB-123-C", car: "Volkswagen Caddy", date: "2026-10-12", endDate: null, company: "Lam Groep" } });
    expect(text.description).toBe("Volkswagen Caddy (AB-123-C) staat ingepland voor onderhoud op 12-10-2026. Breng de auto op de afgesproken dag naar Lam Groep.");
  });

  it("puts together what changed on a reservation, with 'no car yet'", async () => {
    await i18n.changeLanguage("en");
    const text = word({
      type: "reservation_changed",
      params: {
        plate: "#12", car: null, oldCar: "Ford Transit (VX-11-AB)", startDate: "2026-10-12", endDate: "2026-10-17",
        oldStartDate: "2026-10-10", oldEndDate: "2026-10-15", datesChanged: true, vehicleChanged: true, company: "Lam Groep",
      },
    });
    expect(text.title).toBe("Reservation changed: #12");
    expect(text.description).toBe("Lam Groep has changed your reservation. The period is now 12/10/2026 to 17/10/2026 (was 10/10/2026 to 15/10/2026). Your car is now no car assigned yet (was Ford Transit (VX-11-AB)).");
  });

  it("names the document kind and leaves out an unknown period", async () => {
    await i18n.changeLanguage("pl");
    const text = word({ type: "document_available", params: { documentKind: "contract", fileName: "contract.pdf", startDate: null, endDate: null } });
    expect(text.title).toBe("Nowy dokument: Umowa najmu");
    expect(text.description).toBe("W portalu klienta czeka na Państwa nowy dokument: Umowa najmu (contract.pdf). Można go tam obejrzeć i pobrać.");
  });

  it("shows a staff reply as written, with only the title translated", async () => {
    await i18n.changeLanguage("it");
    const text = word({ type: "request_done", description: "Akkoord, tot vrijdag", params: { id: 7, reply: "Akkoord, tot vrijdag", company: "Lam Groep" } });
    expect(text).toEqual({ title: "Richiesta n. 7 evasa", description: "Akkoord, tot vrijdag" });
  });

  it("writes the fine amount in the reader's notation", async () => {
    await i18n.changeLanguage("en");
    expect(word({ type: "fine_linked", params: { plate: "AB-123-C", description: "Speeding", amount: "95.00" } }).description).toBe("Speeding · €95.00");
  });
});
