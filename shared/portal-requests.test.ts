import { describe, it, expect } from "vitest";
import { isValidRequestTransition, requestPayloadSchemas } from "./portal-requests";

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
