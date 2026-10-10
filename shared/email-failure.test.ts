/**
 * Audit 2026-10-09, module 13, finding 2 (A-13-2): the log kept the reason of a
 * failed mail only as English prose ("No valid email configuration for
 * purpose: custom"), so the screen could only show it as it was. The server now
 * puts a stable code in front ("NO_EMAIL_CONFIG: ..."), the way the SMTP
 * failures already did ("ETIMEDOUT: ..."), and the client translates the code.
 */
import { describe, it, expect } from "vitest";
import { EMAIL_FAILURE_CODES, withFailureCode, parseFailureReason, splitFailureReasons, summariseFailureReasons } from "./email-failure";

describe("failure reason codes", () => {
  it("prefixes a code and reads it back", () => {
    const stored = withFailureCode(EMAIL_FAILURE_CODES.NO_EMAIL_CONFIG, "No valid email configuration for purpose: custom");
    expect(stored).toBe("NO_EMAIL_CONFIG: No valid email configuration for purpose: custom");
    expect(parseFailureReason(stored)).toEqual({ code: "NO_EMAIL_CONFIG", detail: "No valid email configuration for purpose: custom" });
  });

  it("reads the codes the SMTP layer has always written", () => {
    expect(parseFailureReason("ETIMEDOUT: Connection to email server timed out.").code).toBe("ETIMEDOUT");
    expect(parseFailureReason("550: Email was rejected by the server.").code).toBe("550");
  });

  it("returns no code for text that has none (rows written before the codes)", () => {
    expect(parseFailureReason("No valid email configuration for purpose: custom")).toEqual({
      code: null,
      detail: "No valid email configuration for purpose: custom",
    });
    expect(parseFailureReason("Failed to send to a@b.nl for vehicle X").code).toBeNull();
    expect(parseFailureReason(null)).toEqual({ code: null, detail: "" });
  });

  it("splits the reasons of one run apart, but only where the next one starts with a code", () => {
    const run = "NO_ADDRESS: No suitable email for vehicle A; SEND_FAILED: Failed to send to x for vehicle B; NO_ADDRESS: No suitable email for vehicle C";
    expect(splitFailureReasons(run)).toEqual([
      "NO_ADDRESS: No suitable email for vehicle A",
      "SEND_FAILED: Failed to send to x for vehicle B",
      "NO_ADDRESS: No suitable email for vehicle C",
    ]);
    expect(splitFailureReasons("No suitable email for A; Failed to send to B")).toEqual(["No suitable email for A; Failed to send to B"]);
  });

  it("counts a run's reasons per code, in order of first appearance, and keeps every raw text", () => {
    const run = "NO_ADDRESS: one; SEND_FAILED: two; NO_ADDRESS: three";
    const summary = summariseFailureReasons(run);
    expect(summary.groups).toEqual([
      { code: "NO_ADDRESS", count: 2 },
      { code: "SEND_FAILED", count: 1 },
    ]);
    expect(summary.details).toEqual(["NO_ADDRESS: one", "SEND_FAILED: two", "NO_ADDRESS: three"]);
  });
});
