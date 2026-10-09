/**
 * Final wave of sub-project C, item 19 - the transport-report check lives next to the
 * other document-type helpers instead of as a private copy in recycle-bin-purge.ts.
 * Same rule as before: the whole type is "transport report" in any spelling
 * (the registry writes the slug `transport_report`), not a prefix.
 */
import { describe, it, expect } from "vitest";
import {
  isContractDocument, isDamageCheckDocument, isTransportReportDocument,
} from "./document-types";

describe("isTransportReportDocument", () => {
  it.each(["transport_report", "Transport Report", "transport-report", "TRANSPORT_REPORT", " transport report "])(
    "%j is a transport report",
    (type) => {
      expect(isTransportReportDocument(type)).toBe(true);
    },
  );

  it.each(["Contract (Unsigned)", "Damage Check", "Transport Report (Signed)", "transport_reports", "transport", "", null, undefined])(
    "%j is not",
    (type) => {
      expect(isTransportReportDocument(type)).toBe(false);
    },
  );

  it("does not overlap with the other two classifiers", () => {
    expect(isContractDocument("transport_report")).toBe(false);
    expect(isDamageCheckDocument("transport_report")).toBe(false);
  });
});
