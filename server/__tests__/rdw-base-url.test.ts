import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { delete process.env.RDW_BASE_URL; vi.resetModules(); });

const fakeFetch = (seen: string[]) => (async (url: string) => {
  seen.push(String(url));
  return new Response(JSON.stringify([{ kenteken: "AB123C" }]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as unknown as typeof fetch;

describe("RDW base address", () => {
  it("talks to opendata.rdw.nl by default", async () => {
    const { fetchRdwFiscalData } = await import("../utils/rdw-api");
    const seen: string[] = [];
    await fetchRdwFiscalData("AB-123-C", fakeFetch(seen));
    expect(seen[0]).toBe("https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=AB123C");
  });

  it("uses RDW_BASE_URL when set, without a double slash", async () => {
    process.env.RDW_BASE_URL = "http://127.0.0.1:5011/";
    vi.resetModules();
    const { fetchRdwFiscalData } = await import("../utils/rdw-api");
    const seen: string[] = [];
    await fetchRdwFiscalData("AB-123-C", fakeFetch(seen));
    expect(seen).toEqual([
      "http://127.0.0.1:5011/resource/m9d7-ebf2.json?kenteken=AB123C",
      "http://127.0.0.1:5011/resource/8ys7-d773.json?kenteken=AB123C",
    ]);
  });
});
