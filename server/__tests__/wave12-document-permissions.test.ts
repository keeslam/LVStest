/**
 * B-23 / BUG-167 — a document permission of its own, with view/edit granularity.
 *
 * Kees' words: "extra vinkje in admin panel of dit ook bekeken/bewerkt mag
 * worden." So two checkboxes, not one, and not riding along on the vehicle or
 * reservation permission.
 *
 * Before this wave every `/api/contracts/*` route sat behind `requireAuth`
 * only: an account holding nothing but `view_vehicles` got 200 on
 * `contracts/data` — address, telephone number and driving-licence number of
 * the customer — and on all three generate endpoints, writing `documents` rows
 * while it was there.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UserPermission } from "../../shared/schema";
import {
  documentPermissionsFor,
  DOCUMENT_PERMISSION_MIGRATION,
} from "../../scripts/migrate-document-permissions";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  cleanupFixtures,
  createFixtureVehicle,
  createFixtureReservation,
  createFixtureCustomer,
} from "./helpers/fixtures";

describe("B-23 — the two document permissions", () => {
  it("both are part of the permission model, so the admin panel renders a checkbox for each", () => {
    expect(UserPermission.VIEW_DOCUMENTS).toBe("view_documents");
    expect(UserPermission.MANAGE_DOCUMENTS).toBe("manage_documents");
    // The users dialog maps over Object.values(UserPermission); being in there
    // *is* the checkbox.
    expect(Object.values(UserPermission)).toContain("view_documents");
    expect(Object.values(UserPermission)).toContain("manage_documents");
  });
});

describe("B-23 — the migration mapping (nobody silently loses access)", () => {
  it("an account that could already manage documents also gets the view right", () => {
    expect(documentPermissionsFor(["manage_documents"])).toEqual(["view_documents"]);
  });

  it("reservation staff keep the contract generation they use every day", () => {
    expect(documentPermissionsFor(["manage_reservations"]).sort()).toEqual(
      ["manage_documents", "view_documents"],
    );
  });

  it("read-only reservation staff get the view right only", () => {
    expect(documentPermissionsFor(["view_reservations"])).toEqual(["view_documents"]);
  });

  it("an account with only view_vehicles gets nothing — that is BUG-167", () => {
    expect(documentPermissionsFor(["view_vehicles"])).toEqual([]);
  });

  it("is idempotent: an account that already has both is left alone", () => {
    expect(documentPermissionsFor(["manage_reservations", "view_documents", "manage_documents"])).toEqual([]);
  });

  it("the deploy-time step is declared with the same three source permissions", () => {
    expect(DOCUMENT_PERMISSION_MIGRATION.marker).toBe("migration:b23_document_permissions");
    expect(DOCUMENT_PERMISSION_MIGRATION.grantsManage.sort()).toEqual(["manage_documents", "manage_reservations"]);
    expect(DOCUMENT_PERMISSION_MIGRATION.grantsView.sort()).toEqual([
      "manage_documents",
      "manage_reservations",
      "view_reservations",
    ]);
  });
});

describe("B-23 / BUG-167 — every document and PDF route is gated", () => {
  let viewVehicles: TestAgent; // the BUG-167 account
  let viewDocs: TestAgent;
  let manageDocs: TestAgent;
  let reservationId: number;

  beforeAll(async () => {
    viewVehicles = await agentFor(["view_vehicles"]);
    viewDocs = await agentFor(["view_documents"]);
    manageDocs = await agentFor(["manage_documents"]);
    const customer = await createFixtureCustomer("B23");
    const vehicle = await createFixtureVehicle();
    reservationId = (await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id })).id;
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  const readRoutes = () => [
    `/api/contracts/data/${reservationId}`,
    `/api/documents/reservation/${reservationId}`,
    `/api/documents`,
  ];

  it("view_vehicles alone can no longer read contract data (BUG-167)", async () => {
    for (const url of readRoutes()) {
      const res = await viewVehicles.get(url);
      expect(res.status, `${url} answered ${res.status}`).toBe(403);
    }
  });

  it("view_vehicles alone can no longer generate a contract", async () => {
    const gets = [
      `/api/contracts/generate/${reservationId}`,
      `/api/contracts/generate-default/${reservationId}`,
    ];
    for (const url of gets) {
      const res = await viewVehicles.get(url);
      expect(res.status, `${url} answered ${res.status}`).toBe(403);
    }
    const versioned = await viewVehicles.post(`/api/contracts/generate-versioned/${reservationId}`).send({});
    expect(versioned.status).toBe(403);
    const preview = await viewVehicles.post("/api/contracts/preview").send({ vehicleId: 1, customerId: 1 });
    expect(preview.status).toBe(403);
  });

  it("view_documents may read but may not generate", async () => {
    for (const url of readRoutes()) {
      const res = await viewDocs.get(url);
      expect([200, 404], `${url} answered ${res.status}`).toContain(res.status);
    }
    const gen = await viewDocs.get(`/api/contracts/generate/${reservationId}`);
    expect(gen.status).toBe(403);
    const versioned = await viewDocs.post(`/api/contracts/generate-versioned/${reservationId}`).send({});
    expect(versioned.status).toBe(403);
    const del = await viewDocs.delete("/api/documents/999999");
    expect(del.status).toBe(403);
  });

  it("manage_documents may generate — it is not refused by the new gate", async () => {
    const res = await manageDocs.get(`/api/contracts/generate/${reservationId}`);
    expect(res.status).not.toBe(403);
  });

  it("manage_reservations alone no longer reaches the contract routes (B-23: no riding along)", async () => {
    const reservationStaff = await agentFor(["manage_reservations"]);
    const res = await reservationStaff.get(`/api/contracts/data/${reservationId}`);
    expect(res.status).toBe(403);
  });
});
