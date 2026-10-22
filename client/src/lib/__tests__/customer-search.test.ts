import { describe, expect, it } from "vitest";
import { customerMatchesSearch } from "../customer-search";

const customer = {
  name: "Jan Jansen", email: "jan@example.nl", phone: "06 1234 5678", city: "Zuidland",
  debtorNumber: "D-10042", companyName: "Jansen Transport B.V.", chamberOfCommerceNumber: "1234 5678",
};

describe("customerMatchesSearch", () => {
  it("still matches the old fields", () => {
    expect(customerMatchesSearch(customer, "jansen")).toBe(true);
    expect(customerMatchesSearch(customer, "ZUIDLAND")).toBe(true);
  });
  it("matches debtor number, company name and KvK", () => {
    expect(customerMatchesSearch(customer, "d-10042")).toBe(true);
    expect(customerMatchesSearch(customer, "transport")).toBe(true);
    expect(customerMatchesSearch(customer, "12345678")).toBe(true);
    expect(customerMatchesSearch(customer, "10042")).toBe(true);
  });
  it("matches a driver name", () => {
    expect(customerMatchesSearch(customer, "piet", ["Piet de Vries"])).toBe(true);
    expect(customerMatchesSearch(customer, "piet")).toBe(false);
  });
  it("does not match unrelated text", () => {
    expect(customerMatchesSearch(customer, "rotterdam")).toBe(false);
    expect(customerMatchesSearch({ name: "X" }, "--")).toBe(false);
  });
});
