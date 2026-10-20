import { describe, it, expect } from "vitest";
import { parseKeyAuditInput } from "./key-audit";

const ok = { mode: "main", expectedCount: 3, missingIds: [1], unexpectedIds: [], scannedIds: [2, 3, 3], note: "  sleutel 1 bij garage " };

describe("parseKeyAuditInput", () => {
  it("accepts a finished audit, drops duplicate ids and trims the note", () => {
    expect(parseKeyAuditInput(ok)).toEqual({
      ok: true,
      value: { mode: "main", expectedCount: 3, missingIds: [1], unexpectedIds: [], scannedIds: [2, 3], note: "sleutel 1 bij garage" },
    });
  });

  it("stores an empty note as nothing", () => {
    expect(parseKeyAuditInput({ ...ok, note: "   " })).toMatchObject({ ok: true, value: { note: null } });
    expect(parseKeyAuditInput({ ...ok, note: undefined })).toMatchObject({ ok: true, value: { note: null } });
  });

  it("names the wrong field", () => {
    expect(parseKeyAuditInput({ ...ok, mode: "both" })).toEqual({ ok: false, field: "mode" });
    expect(parseKeyAuditInput({ ...ok, expectedCount: -1 })).toEqual({ ok: false, field: "expectedCount" });
    expect(parseKeyAuditInput({ ...ok, missingIds: ["1"] })).toEqual({ ok: false, field: "missingIds" });
    expect(parseKeyAuditInput({ ...ok, scannedIds: null })).toEqual({ ok: false, field: "scannedIds" });
    expect(parseKeyAuditInput({ ...ok, note: "x".repeat(2001) })).toEqual({ ok: false, field: "note" });
  });
});
