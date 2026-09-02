import { describe, it, expect } from "vitest";
import { isPortalPath, isPortalApiPath } from "../portal-paths";

describe("portal paths", () => {
  it("recognises page and api paths", () => {
    expect(isPortalPath("/portaal")).toBe(true);
    expect(isPortalPath("/portaal/reserveringen/3")).toBe(true);
    expect(isPortalPath("/api/portal/me")).toBe(true);
    expect(isPortalPath("/portaalx")).toBe(false);
    expect(isPortalPath("/api/portal-admin/accounts")).toBe(false);
    expect(isPortalPath("/vehicles")).toBe(false);
  });
  it("api helper ignores page paths", () => {
    expect(isPortalApiPath("/api/portal/login")).toBe(true);
    expect(isPortalApiPath("/portaal")).toBe(false);
  });
});
