/**
 * PHASE 57 / WAVE 14 items 3-7 — one Dutch word per stored value.
 *
 * The validation pass read the interface screen by screen and found the same
 * defect in four shapes: a label built ad hoc per screen instead of coming from
 * one place.
 *
 *   item 3 — `completed` was *Voltooid* in reserveringen and *Afgerond* on the
 *            scan screen; `returned` was *Ingeleverd* in one place and
 *            *Geretourneerd* in another.
 *   item 4 — the cost categories were half English: the reports printed
 *            *Cleaning, Parking, Insurance, Tires, Toll* (the stored lowercase
 *            value under `text-transform: capitalize`) and the cost overview
 *            showed `parking` and `toll` in lowercase between the Dutch words,
 *            because its local ten-entry map did not contain them.
 *   item 5 — ISO dates leaked into two employee screens: the global search
 *            dropdown wrote `2026-09-13 t/m 2026-09-20` and the APK reminder
 *            list wrote `APK: 2026-06-07`, while the rest of the app writes
 *            13-09-2026.
 *   item 6 — *vloot* versus *wagenpark*, and `Coupé` in the vehicle form
 *            versus `Coupe` in the communication list.
 *   item 7 — the sweep: every remaining enum label routed through the shared
 *            helpers, the way `formatMaintenanceType` and
 *            `shared/permission-labels.ts` already work.
 *
 * The chosen words, so the next screen does not have to guess:
 *   `completed` -> **Voltooid**      (14-woordenlijst's main entry)
 *   `returned`  -> **Ingeleverd**    (the 5.12 table, and "Inleveren")
 *   `parking`   -> **Parkeren**
 *   `toll`      -> **Tol**
 *   fleet       -> **wagenpark**     (the screen is Voertuigenpark)
 *   body style  -> **Coupé**         (the form's spelling)
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect } from "vitest";
import {
  formatExpenseCategory,
  formatVehicleType,
  formatReservationStatus,
} from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";

async function source(relative: string): Promise<string> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  return fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");
}

/* ================================================================== *
 * Item 3 — one Dutch word per reservation status
 * ================================================================== */

describe("WAVE 14 item 3 — één status, één woord", () => {
  it("calls `completed` Voltooid and `returned` Ingeleverd", () => {
    expect(formatReservationStatus("completed")).toBe("Voltooid");
    expect(formatReservationStatus("returned")).toBe("Ingeleverd");
  });

  it("uses the same two words on the scan screen as in reserveringen", async () => {
    const barcodes = (await import("@/locales/nl/barcodes.json")).default as any;
    const reservations = (await import("@/locales/nl/reservations.json")).default as any;

    // PHASE 57: "Afgerond" on the scan screen, "Voltooid" in reserveringen.
    expect(barcodes.scanPage.reservationStatus.completed).toBe("Voltooid");
    expect(barcodes.scanPage.reservationStatus.returned).toBe("Ingeleverd");
    expect(reservations.detailsPage.statusLabels.completed).toBe("Voltooid");
    expect(reservations.detailsPage.statusLabels.returned).toBe("Ingeleverd");
    expect(reservations.indexPage.statusTabReturned).toBe("Ingeleverd");
    expect(reservations.calendarPage.returnedShortLabel).toBe("Ingeleverd");
    expect(reservations.form.statuses.returned).toBe("Ingeleverd");
  });

  it("leaves no Dutch screen calling a reservation Geretourneerd", async () => {
    for (const file of ["barcodes", "reservations", "dashboard", "vehicles"]) {
      const nl = JSON.stringify((await import(`@/locales/nl/${file}.json`)).default);
      expect(nl, `${file}.json`).not.toContain("Geretourneerd");
    }
  });

  it("agrees with 14-woordenlijst.md", async () => {
    const glossary = await source("docs/gebruikershandleiding/14-woordenlijst.md");
    // The entry that documented the split ("Op het scanscherm heet die status
    // **Afgerond**") is gone, because the split is gone.
    expect(glossary).not.toContain("Op het scanscherm heet die status");
    expect(glossary).not.toContain("Op het scanscherm\nheet dezelfde status **Afgerond**");
  });
});

/* ================================================================== *
 * Item 4 — one Dutch word per cost category
 * ================================================================== */

describe("WAVE 14 item 4 — de kostencategorieën zijn Nederlands", () => {
  it("translates the five categories the reports printed in English", () => {
    expect(formatExpenseCategory("cleaning")).toBe("Schoonmaak");
    expect(formatExpenseCategory("parking")).toBe("Parkeren");
    expect(formatExpenseCategory("insurance")).toBe("Verzekering");
    expect(formatExpenseCategory("tires")).toBe("Banden");
    expect(formatExpenseCategory("toll")).toBe("Tol");
  });

  it("reads the stored value whichever way it was capitalised", () => {
    // Seeded rows are lowercase, the dropdown writes "Cleaning".
    expect(formatExpenseCategory("Cleaning")).toBe("Schoonmaak");
    expect(formatExpenseCategory("PARKING")).toBe("Parkeren");
    expect(formatExpenseCategory("front window")).toBe("Front Window");
    expect(formatExpenseCategory(null)).toBe("");
    expect(formatExpenseCategory("   ")).toBe("");
  });

  it("no screen prints the raw category any more", async () => {
    const reports = await source("client/src/pages/reports/index.tsx");
    // The two shapes PHASE 57 saw: `capitalize` over the stored word.
    expect(reports).not.toContain('<TableCell className="capitalize">{expense.category}</TableCell>');
    expect(reports).not.toContain('text-transform: capitalize;">${esc(category)}');
    expect(reports).not.toContain('text-transform: capitalize;">${esc(expense.category)}');
    expect(reports).toContain("formatExpenseCategory");

    const overview = await source("client/src/pages/expenses/index.tsx");
    // The local map that did not know `parking` and `toll`.
    expect(overview).not.toContain("const EXPENSE_CATEGORY_KEYS");
    expect(overview).toContain("formatExpenseCategory");
  });
});

/* ================================================================== *
 * Item 5 — Dutch dates on employee screens
 * ================================================================== */

describe("WAVE 14 item 5 — geen ISO-datums in de schermen", () => {
  it("writes 13-09-2026, not 2026-09-13", () => {
    expect(formatDateNl("2026-09-13", "short")).toBe("13-09-2026");
    expect(formatDateNl("2026-06-07", "short")).toBe("07-06-2026");
  });

  it("the global search dropdown no longer hands the stored date to the label", async () => {
    const layout = await source("client/src/layouts/MainLayout.tsx");
    // "2026-09-13 t/m 2026-09-20" came from passing these straight through.
    expect(layout).not.toContain("from: reservation.startDate,");
    expect(layout).not.toContain("to: reservation.endDate || t('search.openEnded')");
    expect(layout).not.toContain("• {reservation.startDate}");
    expect(layout).toContain("formatDateNl(reservation.startDate, 'short')");
  });

  it("the APK reminder list no longer writes APK: <iso>", async () => {
    const comms = await source("client/src/pages/CustomerCommunications.tsx");
    expect(comms).not.toContain("APK: {filterInfo.apkDate}");
    expect(comms).toContain("formatDateNl(filterInfo.apkDate, 'short')");

    const details = await source("client/src/components/vehicles/vehicle-details.tsx");
    expect(details).not.toContain("{ start: item.reservation?.startDate, end: item.reservation?.endDate }");
    expect(details).toContain("formatDateNl(item.reservation?.startDate, 'short')");
  });
});

/* ================================================================== *
 * Item 6 — wagenpark, and one spelling of Coupé
 * ================================================================== */

describe("WAVE 14 item 6 — wagenpark en Coupé", () => {
  it("says wagenpark in the toast the vehicle screen shows", async () => {
    const nl = (await import("@/locales/nl/vehicles.json")).default as any;
    expect(nl.vehicleForm.toasts.vehicleCreatedDescription).toContain("wagenpark");
    expect(nl.vehicleForm.toasts.vehicleUpdatedDescription).toContain("wagenpark");
    expect(JSON.stringify(nl)).not.toContain("je vloot");

    const expenses = (await import("@/locales/nl/expenses.json")).default as any;
    expect(expenses.addDialog.description).toContain("wagenpark");
  });

  it("spells the body style Coupé everywhere, from the stored `Coupe`", () => {
    expect(formatVehicleType("Coupe")).toBe("Coupé");
    expect(formatVehicleType("coupe")).toBe("Coupé");
    expect(formatVehicleType("SUV")).toBe("SUV");
    expect(formatVehicleType("Truck")).toBe("Vrachtwagen");
    // A type nobody mapped is handed back as it is stored, never blanked.
    expect(formatVehicleType("Bestelwagen")).toBe("Bestelwagen");
    expect(formatVehicleType(null)).toBe("");
  });

  it("the communication list asks the helper instead of printing the column", async () => {
    const comms = await source("client/src/pages/CustomerCommunications.tsx");
    expect(comms).not.toContain("{vehicle.vehicleType || t(");
    expect(comms).toContain("formatVehicleType(vehicle.vehicleType)");
  });
});

/* ================================================================== *
 * Item 7 — the sweep
 * ================================================================== */

describe("WAVE 14 item 7 — geen scherm bouwt zijn eigen label meer", () => {
  it("the two screens that still printed the stored reservation status ask the helper", async () => {
    const list = await source("client/src/components/maintenance/maintenance-list-dialog.tsx");
    expect(list).toContain("formatReservationStatus(reservation.status)");

    const pickup = await source("client/src/components/reservations/pickup-return-dialogs.tsx");
    expect(pickup).not.toContain("</strong> {duplicateReservationInfo.status}");
    expect(pickup).toContain("formatReservationStatus(duplicateReservationInfo.status)");
  });

  it("the maintenance block on the scan screen uses the same word as the maintenance screen", async () => {
    const barcodes = (await import("@/locales/nl/barcodes.json")).default as any;
    const maintenance = (await import("@/locales/nl/maintenance.json")).default as any;
    expect(barcodes.scanPage.maintenance.blockStatus.out).toBe(maintenance.viewDialog.statusCompleted);
  });

  it("the three cost screens share one source for the category label", async () => {
    for (const file of [
      "client/src/pages/expenses/index.tsx",
      "client/src/pages/reports/index.tsx",
      "client/src/components/expenses/expense-form.tsx",
      "client/src/components/invoice-scanner.tsx",
    ]) {
      const s = await source(file);
      expect(s, file).toContain("formatExpenseCategory");
      expect(s, file).not.toContain("const EXPENSE_CATEGORY_KEYS");
    }
  });

  it("every enum helper answers in words, never with a key and never blank", () => {
    // A value nobody translated yet still reads, and an empty one stays empty
    // instead of rendering `expenses:form.categories.undefined`.
    expect(formatExpenseCategory("some_new_thing")).toBe("Some New Thing");
    // The body style keeps the capitals it is stored with, so `SUV` does not
    // come back as `Suv`.
    expect(formatVehicleType("Bestelwagen")).toBe("Bestelwagen");
    for (const helper of [formatExpenseCategory, formatVehicleType, formatReservationStatus]) {
      expect(helper(undefined as any)).toBe("");
      expect(String(helper("x" as any))).not.toContain(":");
    }
  });
});
