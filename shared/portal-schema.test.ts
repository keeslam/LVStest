import { describe, it, expect } from "vitest";
import {
  insertPortalUserSchema,
  insertPortalCustomerSettingsSchema,
  PortalUserRole,
  UserPermission,
  vehicles,
} from "./schema";
import { getTableColumns } from "drizzle-orm";

describe("portal schema", () => {
  it("accepts a driver-role user only with a driverId", () => {
    const base = { customerId: 1, email: "a@b.nl", fullName: "A", role: PortalUserRole.DRIVER };
    expect(insertPortalUserSchema.safeParse(base).success).toBe(false);
    expect(insertPortalUserSchema.safeParse({ ...base, driverId: 5 }).success).toBe(true);
  });

  it("lower-cases the e-mail", () => {
    const parsed = insertPortalUserSchema.parse({ customerId: 1, email: "Kees@Lam.NL", fullName: "K", role: "admin" });
    expect(parsed.email).toBe("kees@lam.nl");
  });

  it("defaults every customer switch to on", () => {
    const parsed = insertPortalCustomerSettingsSchema.parse({ customerId: 1 });
    expect(parsed.portalEnabled ?? true).toBe(true);
    expect(parsed.canBook ?? true).toBe(true);
  });

  it("adds the portal permissions and vehicle columns", () => {
    expect(UserPermission.MANAGE_PORTAL).toBe("manage_portal");
    expect(UserPermission.VIEW_PORTAL).toBe("view_portal");
    const cols = getTableColumns(vehicles);
    expect(cols.offeredOnline).toBeDefined();
    expect(cols.onlineDescription).toBeDefined();
  });
});
