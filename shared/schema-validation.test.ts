/**
 * FIX-Z — schema-level input validation (BUG-020, BUG-041, BUG-042, BUG-044,
 * BUG-054, BUG-058, BUG-059, BUG-125, BUG-149).
 *
 * Pure zod, no database: these are the rules drizzle-zod typed permissively and
 * nobody tightened. The route-level half (a duplicate plate that differs only in
 * punctuation) lives in server/__tests__/fix-z-input-validation.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  insertVehicleSchema,
  insertCustomerSchema,
  insertReservationSchemaBase,
  licensePlateSchema,
  normaliseLicensePlate,
  isCalendarDate,
} from "./schema";

const baseVehicle = { licensePlate: "75XT255", brand: "Ford", model: "Transit" };
const baseCustomer = { name: "Jansen BV" };

function vehicleResult(overrides: Record<string, unknown>) {
  return insertVehicleSchema.safeParse({ ...baseVehicle, ...overrides });
}

describe("FIX-Z — license plates (BUG-020, BUG-058)", () => {
  it("normalises the same plate written three ways to one form", () => {
    expect(normaliseLicensePlate("AB-123-C")).toBe("AB123C");
    expect(normaliseLicensePlate("ab123c")).toBe("AB123C");
    expect(normaliseLicensePlate("AB 123 C")).toBe("AB123C");
  });

  it("stores the plate trimmed and upper-cased", () => {
    expect(licensePlateSchema.parse("  ab-123-c ")).toBe("AB-123-C");
  });

  it("refuses an emoji plate and a 100-character plate", () => {
    expect(vehicleResult({ licensePlate: "🚚-123" }).success).toBe(false);
    expect(vehicleResult({ licensePlate: "A".repeat(100) }).success).toBe(false);
    expect(vehicleResult({ licensePlate: "" }).success).toBe(false);
    expect(vehicleResult({ licensePlate: "   " }).success).toBe(false);
    expect(vehicleResult({ licensePlate: "AB" }).success).toBe(false);
  });

  it("still accepts the plates this fleet actually uses", () => {
    for (const plate of ["75XT255", "AB-123-C", "1-ABC-23", "FIXT-abc123"]) {
      expect(vehicleResult({ licensePlate: plate }).success, plate).toBe(true);
    }
  });
});

describe("FIX-Z — mileages (BUG-041)", () => {
  it("refuses a negative reading on every mileage column", () => {
    for (const field of ["currentMileage", "departureMileage", "returnMileage", "lastServiceMileage"]) {
      expect(vehicleResult({ [field]: -1 }).success, field).toBe(false);
    }
  });

  it("accepts zero and a real reading", () => {
    expect(vehicleResult({ departureMileage: 0, returnMileage: 120_000 }).success).toBe(true);
  });
});

describe("FIX-Z — dates (BUG-042)", () => {
  it("knows a real calendar day from an impossible one", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("26-02-2026")).toBe(false);
  });

  it("refuses 2026-02-30 in apkDate and accepts 2026-02-28", () => {
    expect(vehicleResult({ apkDate: "2026-02-30" }).success).toBe(false);
    expect(vehicleResult({ apkDate: "2026-02-28" }).success).toBe(true);
    expect(vehicleResult({ apkDate: null }).success).toBe(true);
  });

  it("covers the other legally relevant date columns", () => {
    for (const field of ["warrantyEndDate", "registeredToDate", "lastServiceDate", "dateIn", "dateOut"]) {
      expect(vehicleResult({ [field]: "not-a-date" }).success, field).toBe(false);
    }
  });
});

describe("FIX-Z — service intervals (BUG-149)", () => {
  it("refuses 0, a negative interval and text", () => {
    for (const value of [0, -1, "abc"]) {
      expect(vehicleResult({ serviceIntervalKm: value }).success, String(value)).toBe(false);
      expect(vehicleResult({ serviceIntervalMonths: value }).success, String(value)).toBe(false);
    }
  });

  it("accepts a real interval and an absent one", () => {
    expect(vehicleResult({ serviceIntervalKm: 30000, serviceIntervalMonths: 12 }).success).toBe(true);
    expect(vehicleResult({ serviceIntervalKm: null }).success).toBe(true);
  });
});

describe("FIX-Z — customer names (BUG-044, BUG-059)", () => {
  it("refuses a blank name and a 5000-character one", () => {
    expect(insertCustomerSchema.safeParse({ ...baseCustomer, name: "   " }).success).toBe(false);
    expect(insertCustomerSchema.safeParse({ ...baseCustomer, name: "" }).success).toBe(false);
    expect(insertCustomerSchema.safeParse({ ...baseCustomer, name: "x".repeat(5000) }).success).toBe(false);
  });

  it("accepts a normal name, trimmed", () => {
    const parsed = insertCustomerSchema.parse({ ...baseCustomer, name: "  Jansen BV  " });
    expect(parsed.name).toBe("Jansen BV");
  });
});

describe("FIX-Z — totalPrice (BUG-054)", () => {
  const base = { vehicleId: 1, startDate: "2026-10-01" };

  it("refuses a negative price and non-numeric text instead of silently dropping it", () => {
    expect(insertReservationSchemaBase.safeParse({ ...base, totalPrice: -1 }).success).toBe(false);
    const abc = insertReservationSchemaBase.safeParse({ ...base, totalPrice: "abc" });
    expect(abc.success).toBe(false);
    expect(insertReservationSchemaBase.safeParse({ ...base, totalPrice: 1e12 }).success).toBe(false);
  });

  it("accepts a real price, a numeric string and an empty one", () => {
    expect(insertReservationSchemaBase.parse({ ...base, totalPrice: 250 }).totalPrice).toBe(250);
    expect(insertReservationSchemaBase.parse({ ...base, totalPrice: "250.50" }).totalPrice).toBe(250.5);
    expect(insertReservationSchemaBase.parse({ ...base, totalPrice: "" }).totalPrice).toBeNull();
    expect(insertReservationSchemaBase.parse({ ...base, totalPrice: null }).totalPrice).toBeNull();
  });
});

/**
 * FIX-R (BUG-072) — the stored-link half of the XSS cluster.
 *
 * `expense.receiptUrl` is typed in by one employee and opened by another with
 * `window.open()`. The client refuses to open an unsafe one; the schema refuses
 * to store it, so the two cannot drift apart.
 */
describe("BUG-072 — receiptUrl may only be a link we are willing to open", () => {
  const baseExpense = { vehicleId: 1, amount: 12.5, category: "fuel", date: "2026-03-09" };

  it("accepts the links an employee really pastes", async () => {
    const { insertExpenseSchema } = await import("./schema");

    for (const receiptUrl of [
      "https://mijn.bank.nl/bon/123.pdf",
      "http://intranet/bonnen/123.pdf",
      "/uploads/receipts/123.pdf",
      "",
    ]) {
      expect(insertExpenseSchema.safeParse({ ...baseExpense, receiptUrl }).success).toBe(true);
    }
    expect(insertExpenseSchema.safeParse({ ...baseExpense, receiptUrl: null }).success).toBe(true);
    expect(insertExpenseSchema.safeParse(baseExpense).success).toBe(true);
  });

  it("refuses a javascript: URL — the stored XSS the audit demonstrated", async () => {
    const { insertExpenseSchema } = await import("./schema");

    for (const receiptUrl of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      const result = insertExpenseSchema.safeParse({ ...baseExpense, receiptUrl });
      expect(result.success, `expected ${receiptUrl} to be rejected`).toBe(false);
    }
  });
});
