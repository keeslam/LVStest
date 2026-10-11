import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getOfficeTimeZone,
  setOfficeTimeZone,
  subscribeOfficeTimeZone,
  toOfficeWallClock,
  formatInOfficeZone,
} from "./office-timezone";
import { officeDate, officeToday, officeTomorrow } from "./office-date";
import { formatDateNl, formatNl } from "./format-date-nl";
import { csvDateTime } from "./csv";

afterEach(() => {
  setOfficeTimeZone("Europe/Amsterdam");
  vi.useRealTimers();
});

describe("D11: de tijdzone van het kantoor op de client", () => {
  it("staat standaard op Europe/Amsterdam zolang er niets geladen is", () => {
    expect(getOfficeTimeZone()).toBe("Europe/Amsterdam");
  });

  it("neemt een geldige zone over, negeert een ongeldige en meldt een wijziging maar één keer", () => {
    const seen: string[] = [];
    const off = subscribeOfficeTimeZone(() => seen.push(getOfficeTimeZone()));
    setOfficeTimeZone("America/Curacao");
    setOfficeTimeZone("America/Curacao");
    setOfficeTimeZone("Mars/Olympus"); // falls back to the default, which is a change
    off();
    setOfficeTimeZone("America/Curacao");
    expect(seen).toEqual(["America/Curacao", "Europe/Amsterdam"]);
  });

  it("America/Curacao: vandaag, morgen en datum volgen de instelling", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T23:30:00Z"));
    expect(officeToday()).toBe("2026-06-22"); // Amsterdam, UTC+2
    expect(officeTomorrow()).toBe("2026-06-23");
    setOfficeTimeZone("America/Curacao"); // UTC-4
    expect(officeToday()).toBe("2026-06-21");
    expect(officeTomorrow()).toBe("2026-06-22");
    expect(officeDate(new Date("2026-06-21T02:00:00Z"))).toBe("2026-06-20");
  });

  it("een tijdstempel wordt in de kantoorzone geschreven (schermen en CSV)", () => {
    const stamp = "2026-06-21T23:30:00.000Z";
    expect(formatDateNl(stamp, "dateTime")).toBe("22 juni 2026 om 01:30");
    expect(formatNl(stamp, "dd-MM-yyyy HH:mm")).toBe("22-06-2026 01:30");
    expect(csvDateTime(stamp)).toBe("22-06-2026 01:30");
    expect(formatInOfficeZone(stamp, "dd-MM-yyyy HH:mm")).toBe("22-06-2026 01:30");
    setOfficeTimeZone("America/Curacao");
    expect(formatDateNl(stamp, "dateTime")).toBe("21 juni 2026 om 19:30");
    expect(formatNl(stamp, "dd-MM-yyyy HH:mm")).toBe("21-06-2026 19:30");
    expect(csvDateTime(stamp)).toBe("21-06-2026 19:30");
    expect(csvDateTime(new Date(stamp))).toBe("21-06-2026 19:30");
    expect(formatInOfficeZone(stamp, "dd-MM-yyyy HH:mm")).toBe("21-06-2026 19:30");
  });

  it("een kale datum (yyyy-MM-dd) blijft de dag die erin staat, in elke zone", () => {
    expect(formatDateNl("2026-06-21", "long")).toBe("21 juni 2026");
    setOfficeTimeZone("America/Curacao");
    expect(formatDateNl("2026-06-21", "long")).toBe("21 juni 2026");
  });

  it("toOfficeWallClock geeft een Date waarvan de lokale velden de wandklok van de zone zijn", () => {
    const d = toOfficeWallClock(new Date("2026-06-21T23:30:00Z"), "America/Curacao");
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 6, 21, 19, 30]);
  });
});
