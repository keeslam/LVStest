/**
 * A-1-2, A-3-7, A-4-5, A-9-5 (audit 2026-10-09): form validation spoke English
 * ("Username is required", "License plate is required", "Category is required").
 * One global zod error map plus translated literals in the schemas; three
 * representative forms are checked here under nl and en.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { z } from "zod";
import i18n from "@/i18n";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, isLoading: false, loginMutation: {} }) }));

import { loginSchema } from "@/pages/auth-page";
import { formSchema as vehicleSchema } from "@/components/vehicles/vehicle-form";
import { formSchema as expenseSchema } from "@/components/expenses/expense-form";
import { formSchema as customerSchema } from "@/components/customers/customer-form";

function messages(schema: z.ZodTypeAny, value: unknown): Record<string, string[]> {
  const result = schema.safeParse(value);
  if (result.success) return {};
  const out: Record<string, string[]> = {};
  for (const issue of result.error.issues) (out[issue.path.join(".")] ??= []).push(issue.message);
  return out;
}

afterEach(async () => {
  await i18n.changeLanguage("nl");
});

describe("zod validation speaks Dutch", () => {
  it("login form (A-1-2)", () => {
    const m = messages(loginSchema, { username: "", password: "" });
    expect(m.username).toEqual(["Vul je gebruikersnaam in"]);
    expect(m.password).toEqual(["Vul je wachtwoord in"]);
  });

  it("vehicle form (A-3-7)", () => {
    const m = messages(vehicleSchema, { licensePlate: "", brand: "", model: "", departureMileage: -5 });
    expect(m.licensePlate).toEqual(["Kenteken is verplicht"]);
    expect(m.brand).toEqual(["Merk is verplicht"]);
    expect(m.model).toEqual(["Model is verplicht"]);
    expect(m.departureMileage).toEqual(["De kilometerstand mag niet negatief zijn"]);
  });

  it("expense form (A-9-5)", () => {
    const m = messages(expenseSchema, { vehicleId: undefined, category: "", amount: undefined, date: "" });
    expect(m.vehicleId?.[0]).toBe("Kies een voertuig");
    expect(m.category).toEqual(["Kies een categorie"]);
    expect(m.amount?.[0]).toBe("Vul een bedrag in");
    expect(m.date).toEqual(["Vul een datum in"]);
  });

  it("customer form: the global map covers the default messages (A-4-5)", () => {
    const m = messages(customerSchema, { name: "A", email: "not-an-email" });
    expect(m.name).toEqual(["De naam moet minimaal 2 tekens bevatten"]);
    expect(m.email).toEqual(["Vul een geldig e-mailadres in"]);
  });

  it("an untouched default (a bare required string) reads Dutch too", () => {
    expect(messages(z.object({ x: z.string() }), {}).x).toEqual(["Dit veld is verplicht"]);
    expect(messages(z.object({ x: z.string().min(4) }), { x: "ab" }).x).toEqual(["Minimaal 4 tekens"]);
    expect(messages(z.object({ x: z.number() }), { x: "abc" }).x).toEqual(["Vul een getal in"]);
  });

  it("follows the language for the default map", async () => {
    await i18n.changeLanguage("en");
    expect(messages(z.object({ x: z.string() }), {}).x).toEqual(["This field is required"]);
  });
});
