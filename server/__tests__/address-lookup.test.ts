import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import request from "supertest";

import { lookupDutchAddress, clearAddressLookupCache } from "../services/address-lookup";
import { registerAddressLookupRoutes } from "../routes/address-lookup";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission } from "../../shared/schema";
import { buildPortalTestApp, buildStaffTestApp, createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

const COOLSINGEL = [
  { straatnaam: "Coolsingel", woonplaatsnaam: "Rotterdam", huisletter: "", huisnummertoevoeging: "" },
  { straatnaam: "Coolsingel", woonplaatsnaam: "Rotterdam", huisletter: "A", huisnummertoevoeging: "" },
  { straatnaam: "Coolsingel", woonplaatsnaam: "Rotterdam", huisletter: "", huisnummertoevoeging: "2" },
];

const realFetch = globalThis.fetch;
let pdok: ReturnType<typeof vi.fn>;
/** Answers PDOK calls with `docs`, everything else (supertest talks to its own server) with the real fetch. */
function mockPdok(docs: unknown[] | "down") {
  pdok = vi.fn(async () => (docs === "down"
    ? new Response("nope", { status: 503 })
    : new Response(JSON.stringify({ response: { numFound: docs.length, docs } }), { status: 200, headers: { "Content-Type": "application/json" } })));
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input instanceof URL ? input.href : input).includes("locatieserver") ? pdok(input, init) : realFetch(input, init)) as typeof fetch;
}

describe("address lookup service", () => {
  beforeEach(() => clearAddressLookupCache());
  afterEach(() => { globalThis.fetch = realFetch; });

  it("finds street and city for a postcode and house number, and formats the postcode", async () => {
    mockPdok(COOLSINGEL);
    expect(await lookupDutchAddress({ postcode: "3011ad", number: "4" })).toEqual({ found: true, exact: true, street: "Coolsingel", city: "Rotterdam", postalCode: "3011 AD" });
    const url = new URL(String(pdok.mock.calls[0][0]));
    expect(url.searchParams.getAll("fq")).toEqual(["postcode:3011AD", "huisnummer:4", "type:adres"]);
  });

  it("accepts a postcode with a space and ignores leading zeros of the number", async () => {
    mockPdok(COOLSINGEL);
    expect((await lookupDutchAddress({ postcode: "3011 AD", number: "04" })).found).toBe(true);
    expect(new URL(String(pdok.mock.calls[0][0])).searchParams.getAll("fq")).toContain("huisnummer:4");
  });

  it("matches an addition against house letters and additions, and is partial when it is unknown", async () => {
    mockPdok(COOLSINGEL);
    expect(await lookupDutchAddress({ postcode: "3011AD", number: "4", addition: "a" })).toMatchObject({ found: true, exact: true });
    expect(await lookupDutchAddress({ postcode: "3011AD", number: "4", addition: "2" })).toMatchObject({ found: true, exact: true });
    // Street and city are still right for an addition we do not know; the form says so.
    expect(await lookupDutchAddress({ postcode: "3011AD", number: "4", addition: "Z" })).toMatchObject({ found: true, exact: false, street: "Coolsingel" });
  });

  it("says not found for an unknown address and does not call PDOK for an invalid postcode", async () => {
    mockPdok([]);
    expect(await lookupDutchAddress({ postcode: "3011AD", number: "999" })).toEqual({ found: false, exact: false });
    pdok.mockClear();
    expect(await lookupDutchAddress({ postcode: "0123AB", number: "1" })).toEqual({ found: false, exact: false });
    expect(await lookupDutchAddress({ postcode: "abc", number: "1" })).toEqual({ found: false, exact: false });
    expect(pdok).not.toHaveBeenCalled();
  });

  it("asks PDOK once for the same address", async () => {
    mockPdok(COOLSINGEL);
    await lookupDutchAddress({ postcode: "3011AD", number: "4" });
    await lookupDutchAddress({ postcode: "3011 ad", number: "4", addition: "A" });
    expect(pdok).toHaveBeenCalledTimes(1);
  });

  it("throws when PDOK is down, so the caller can say so instead of 'not found'", async () => {
    mockPdok("down");
    await expect(lookupDutchAddress({ postcode: "3011AD", number: "4" })).rejects.toThrow(/503/);
  });
});

describe("address lookup routes", () => {
  const staff = buildStaffTestApp([UserPermission.MANAGE_CUSTOMERS], (app) => registerAddressLookupRoutes(app, { requireAuth: (_r: any, _s: any, n: any) => n(), uploadsDir: getUploadsDir() } as any));
  const noRights = buildStaffTestApp([UserPermission.VIEW_VEHICLES], (app) => registerAddressLookupRoutes(app, { requireAuth: (_r: any, _s: any, n: any) => n(), uploadsDir: getUploadsDir() } as any));
  const portal = buildPortalTestApp();
  const password = "wachtwoord-1234";

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customer = await createTestCustomer("Adres");
    const user = await portalStorage.createPortalUser({ customerId: customer.id, email: `adres@${TEST_EMAIL_DOMAIN}`, fullName: "Adres", role: "admin" }, "t");
    await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword(password) });
  });
  afterAll(cleanupPortalTestData);
  beforeEach(() => clearAddressLookupCache());
  afterEach(() => { globalThis.fetch = realFetch; });

  it("answers the staff app", async () => {
    mockPdok(COOLSINGEL);
    const res = await request(staff).get("/api/address-lookup").query({ postcode: "3011AD", number: "4" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ found: true, street: "Coolsingel", city: "Rotterdam" });
  });

  it("is for staff who manage customers: another staff account gets 403 and nothing is looked up", async () => {
    mockPdok(COOLSINGEL);
    expect((await request(noRights).get("/api/address-lookup").query({ postcode: "3011AD", number: "4" })).status).toBe(403);
    expect(pdok).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-numeric house number with a 400", async () => {
    mockPdok(COOLSINGEL);
    expect((await request(staff).get("/api/address-lookup").query({ postcode: "3011AD" })).status).toBe(400);
    expect((await request(staff).get("/api/address-lookup").query({ postcode: "3011AD", number: "4a" })).status).toBe(400);
    expect(pdok).not.toHaveBeenCalled();
  });

  it("answers 502 with a code when PDOK is down, and 200 found:false for an unknown address", async () => {
    mockPdok("down");
    const down = await request(staff).get("/api/address-lookup").query({ postcode: "3011AD", number: "4" });
    expect(down.status).toBe(502);
    expect(down.body.code).toBe("ADDRESS_LOOKUP_UNAVAILABLE");
    mockPdok([]);
    const none = await request(staff).get("/api/address-lookup").query({ postcode: "3011AD", number: "999" });
    expect(none.status).toBe(200);
    expect(none.body.found).toBe(false);
  });

  it("is behind the portal session in the portal", async () => {
    mockPdok(COOLSINGEL);
    expect((await request(portal).get("/api/portal/address-lookup").query({ postcode: "3011AD", number: "4" })).status).toBe(401);
    const agent = request.agent(portal);
    await agent.post("/api/portal/login").send({ email: `adres@${TEST_EMAIL_DOMAIN}`, password });
    const res = await agent.get("/api/portal/address-lookup").query({ postcode: "3011AD", number: "4" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ found: true, street: "Coolsingel" });
  });
});
