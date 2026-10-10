/**
 * A-19-3, A-19-8, A-12-7 (audit 2026-10-09, module 19): the CSV exports
 * differed (separator, "95.00" vs "95,00", ISO vs local dates) and none said
 * which file it made. One writer: UTF-8 BOM, ";" separator, decimal comma,
 * dd-mm-yyyy, a file name of the form <onderwerp>-<yyyy-mm-dd>.csv, and a
 * toast that names the file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toastSpy(...args), useToast: () => ({ toast: toastSpy }) }));

import { csvText, csvNumber, csvDate, csvDateTime, csvFileName, downloadCsv } from "@/lib/csv";
import { fileSizeText } from "@/lib/file-ready";

beforeEach(() => toastSpy.mockClear());

describe("csvText", () => {
  it("starts with a BOM, separates with semicolons and ends rows with CRLF", () => {
    const text = csvText(["Kenteken", "Bedrag"], [["38-XT-12", "95,00"]]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1)).toBe("Kenteken;Bedrag\r\n38-XT-12;95,00");
  });

  it("quotes a cell with a separator, a quote or a line break, and doubles the quotes", () => {
    const text = csvText(["a"], [["x;y"], ['say "hi"'], ["two\nlines"], [null], [undefined], [7]]);
    expect(text.slice(1).split("\r\n")).toEqual(["a", '"x;y"', '"say ""hi"""', '"two\nlines"', "", "", "7"]);
  });
});

describe("csv values", () => {
  it("writes numbers with a decimal comma and two decimals", () => {
    expect(csvNumber(95)).toBe("95,00");
    expect(csvNumber("150")).toBe("150,00");
    expect(csvNumber(1234.5)).toBe("1234,50");
    expect(csvNumber(12, 0)).toBe("12");
    expect(csvNumber(null)).toBe("");
    expect(csvNumber("abc")).toBe("");
  });

  it("writes dates as dd-mm-yyyy and times without seconds", () => {
    expect(csvDate("2026-10-09")).toBe("09-10-2026");
    expect(csvDate("2026-10-09T14:05:33.000Z")).toBe("09-10-2026");
    expect(csvDate(null)).toBe("");
    expect(csvDate("rubbish")).toBe("");
    expect(csvDateTime("2026-10-09T08:00:59")).toBe("09-10-2026 08:00");
  });

  it("names the file <onderwerp>-<yyyy-mm-dd>.csv", () => {
    expect(csvFileName("boetes", "2026-10-10")).toBe("boetes-2026-10-10.csv");
    expect(csvFileName("boetes-klant-7.csv", "2026-10-10")).toBe("boetes-klant-7-2026-10-10.csv");
  });
});

describe("downloadCsv", () => {
  const createObjectURL = vi.fn(() => "blob:x");
  const revoke = vi.fn();
  beforeEach(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL: revoke });
  });
  afterEach(() => vi.restoreAllMocks());

  it("downloads the dated file and tells the user its name and size", () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    const name = downloadCsv("boetes", ["Kenteken"], [["38-XT-12"]], "2026-10-10");
    expect(name).toBe("boetes-2026-10-10.csv");
    expect(clicked).toEqual(["boetes-2026-10-10.csv"]);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const toastArg = toastSpy.mock.calls[0][0] as { title: string; description: string };
    expect(toastArg.title).toBe("Bestand gemaakt");
    expect(toastArg.description).toContain("boetes-2026-10-10.csv");
    expect(toastArg.description).toMatch(/\(\d+ B\)/);
  });
});

describe("fileSizeText", () => {
  it("is short and Dutch", () => {
    expect(fileSizeText(512)).toBe("512 B");
    expect(fileSizeText(12 * 1024)).toBe("12 kB");
    expect(fileSizeText(1.5 * 1024 * 1024)).toBe("1,5 MB");
    expect(fileSizeText(448_421_025)).toBe("428 MB");
  });
});
