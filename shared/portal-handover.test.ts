import { describe, it, expect } from "vitest";
import { handoverOf, joinLocation } from "./portal-handover";

describe("handoverOf", () => {
  it("is the shop at both ends when no service is set", () => {
    expect(handoverOf({})).toEqual({ pickup: { method: "shop", location: null }, return: { method: "shop", location: null } });
    expect(handoverOf({ deliveryRequired: false, collectionRequired: false, deliveryAddress: "Wordt genegeerd 1" }).pickup).toEqual({ method: "shop", location: null });
  });
  it("is delivery to the delivery address when the delivery service is on", () => {
    const h = handoverOf({ deliveryRequired: true, deliveryAddress: "Dorpsstraat 1", deliveryPostalCode: "1234 AB", deliveryCity: "Utrecht" });
    expect(h.pickup).toEqual({ method: "delivery", location: "Dorpsstraat 1, 1234 AB Utrecht" });
    expect(h.return.method).toBe("shop");
  });
  it("is collection at its own address, which may differ from the delivery address", () => {
    const h = handoverOf({ deliveryRequired: true, deliveryAddress: "Dorpsstraat 1", deliveryCity: "Utrecht", collectionRequired: true, collectionAddress: "Havenweg 9", collectionCity: "Rotterdam" });
    expect(h.pickup.location).toBe("Dorpsstraat 1, Utrecht");
    expect(h.return).toEqual({ method: "collection", location: "Havenweg 9, Rotterdam" });
  });
  it("keeps the method when the place is not filled in yet", () => {
    expect(handoverOf({ deliveryRequired: true }).pickup).toEqual({ method: "delivery", location: null });
    expect(handoverOf({ collectionRequired: true, collectionAddress: "  " }).return).toEqual({ method: "collection", location: null });
  });
});

describe("joinLocation", () => {
  it("joins what is there", () => {
    expect(joinLocation("Kade 1", null, "Rotterdam")).toBe("Kade 1, Rotterdam");
    expect(joinLocation(null, "3011 AD", null)).toBe("3011 AD");
    expect(joinLocation("", " ", undefined)).toBeNull();
  });
});
