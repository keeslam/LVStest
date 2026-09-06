import { describe, it, expect } from "vitest";
import { isValidRequestTransition, requestPayloadSchemas, REQUEST_NEEDS, PortalRequestType } from "./portal-requests";

describe("portal requests shared", () => {
  it("validates transitions", () => {
    expect(isValidRequestTransition("new", "in_progress")).toBe(true);
    expect(isValidRequestTransition("done", "new")).toBe(false);
    expect(isValidRequestTransition("in_progress", "rejected")).toBe(true);
  });
  it("validates payloads per type", () => {
    expect(requestPayloadSchemas.extension.safeParse({ newEndDate: "2026-10-01" }).success).toBe(true);
    expect(requestPayloadSchemas.extension.safeParse({ newEndDate: "1-10-2026" }).success).toBe(false);
    expect(requestPayloadSchemas.other.safeParse({}).success).toBe(false);
    expect(requestPayloadSchemas.fine_question.safeParse({}).success).toBe(true);
  });
});

describe("maintenance request payloads", () => {
  it("maintenance accepts the replacement wish and a preferred date, defaults to no replacement", () => {
    const r = requestPayloadSchemas.maintenance.parse({ issue: "Lampje", mileage: "12000", urgent: "true", needsReplacement: "true", preferredDate: "2026-12-01" });
    expect(r).toMatchObject({ issue: "Lampje", mileage: 12000, urgent: true, needsReplacement: true, preferredDate: "2026-12-01" });
    expect(requestPayloadSchemas.maintenance.parse({ issue: "Lampje", preferredDate: "" })).toMatchObject({ needsReplacement: false, preferredDate: undefined });
  });
  it("maintenance_change needs a date and a reason", () => {
    expect(requestPayloadSchemas.maintenance_change.safeParse({ newDate: "2026-12-05", reason: "Vakantie" }).success).toBe(true);
    expect(requestPayloadSchemas.maintenance_change.safeParse({ newDate: "2026-12-05" }).success).toBe(false);
    expect(requestPayloadSchemas.maintenance_change.safeParse({ newDate: "5-12-2026", reason: "x" }).success).toBe(false);
    expect(REQUEST_NEEDS.maintenance_change).toBe("reservation");
    expect(PortalRequestType.MAINTENANCE_CHANGE).toBe("maintenance_change");
  });
});
