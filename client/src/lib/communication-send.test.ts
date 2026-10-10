/**
 * Audit 2026-10-09, module 13, finding 2 (A-13-2): a send that mailed nobody
 * ended in the toast "Meldingen succesvol verstuurd - 0 e-mails verstuurd,
 * 1 mislukt". The outcome is classified from the counts, never assumed.
 */
import { describe, it, expect } from "vitest";
import { classifySendResult, firstFailureCode } from "./communication-send";

describe("classifySendResult", () => {
  it("everything went: success", () => {
    expect(classifySendResult({ sent: 3, failed: 0 })).toBe("success");
  });
  it("some went, some did not: partial", () => {
    expect(classifySendResult({ sent: 2, failed: 1 })).toBe("partial");
  });
  it("none went: failed, however the server answered (200 with 0 sent)", () => {
    expect(classifySendResult({ sent: 0, failed: 1 })).toBe("failed");
    expect(classifySendResult({ sent: 0, failed: 0 })).toBe("failed");
  });
  it("missing counts count as zero", () => {
    expect(classifySendResult({} as any)).toBe("failed");
  });
});

describe("firstFailureCode", () => {
  it("is the code of the first coded error the server returned", () => {
    expect(firstFailureCode(["SEND_FAILED: Failed to send to x", "NO_ADDRESS: y"])).toBe("SEND_FAILED");
  });
  it("is null when there is no error, or none with a code", () => {
    expect(firstFailureCode(undefined)).toBeNull();
    expect(firstFailureCode(["Failed to send to x"])).toBeNull();
  });
});
