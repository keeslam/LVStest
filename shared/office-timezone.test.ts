import { describe, it, expect } from "vitest";
import {
  DEFAULT_OFFICE_TIMEZONE,
  isValidTimeZone,
  officeTimeZoneFromSetting,
  dateInZone,
  zoneOffsetMinutes,
  zoneOffsetLabel,
  zonedDateTimeToInstant,
  europeanTimeZones,
} from "./office-timezone";

describe("tijdzone-instelling (D11 7.1): gedeelde helpers", () => {
  it("de standaardzone is Europe/Amsterdam", () => {
    expect(DEFAULT_OFFICE_TIMEZONE).toBe("Europe/Amsterdam");
  });

  it("herkent geldige en ongeldige IANA-namen", () => {
    expect(isValidTimeZone("Europe/Amsterdam")).toBe(true);
    expect(isValidTimeZone("America/Curacao")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42 as unknown)).toBe(false);
  });

  it("leest een opgeslagen waarde (tekst of {timeZone}) en valt anders terug op de standaard", () => {
    expect(officeTimeZoneFromSetting("America/Curacao")).toBe("America/Curacao");
    expect(officeTimeZoneFromSetting({ timeZone: "Europe/London" })).toBe("Europe/London");
    expect(officeTimeZoneFromSetting("Mars/Olympus")).toBe("Europe/Amsterdam");
    expect(officeTimeZoneFromSetting(null)).toBe("Europe/Amsterdam");
    expect(officeTimeZoneFromSetting(undefined)).toBe("Europe/Amsterdam");
  });

  it("geeft de kalenderdatum van een moment in de gekozen zone", () => {
    const instant = new Date("2026-06-21T23:30:00Z");
    expect(dateInZone(instant, "Europe/Amsterdam")).toBe("2026-06-22"); // UTC+2
    expect(dateInZone(instant, "America/Curacao")).toBe("2026-06-21"); // UTC-4, no DST
    expect(dateInZone(new Date("2026-12-21T23:30:00Z"), "Europe/Amsterdam")).toBe("2026-12-22");
  });

  it("rekent de afwijking per moment uit, zomertijd inbegrepen", () => {
    expect(zoneOffsetMinutes("Europe/Amsterdam", new Date("2026-01-15T12:00:00Z"))).toBe(60);
    expect(zoneOffsetMinutes("Europe/Amsterdam", new Date("2026-07-15T12:00:00Z"))).toBe(120);
    expect(zoneOffsetMinutes("America/Curacao", new Date("2026-07-15T12:00:00Z"))).toBe(-240);
    expect(zoneOffsetLabel("Europe/Amsterdam", new Date("2026-07-15T12:00:00Z"))).toBe("UTC+02:00");
    expect(zoneOffsetLabel("America/Curacao", new Date("2026-07-15T12:00:00Z"))).toBe("UTC-04:00");
  });

  it("zet een datum plus wandkloktijd om naar het juiste moment", () => {
    expect(zonedDateTimeToInstant("2026-07-15", "08:00", "Europe/Amsterdam").toISOString()).toBe("2026-07-15T06:00:00.000Z");
    expect(zonedDateTimeToInstant("2026-01-15", "08:00", "Europe/Amsterdam").toISOString()).toBe("2026-01-15T07:00:00.000Z");
    expect(zonedDateTimeToInstant("2026-07-15", "08:00", "America/Curacao").toISOString()).toBe("2026-07-15T12:00:00.000Z");
    // The day the clocks go forward (29 March 2026): 08:00 is already summer time.
    expect(zonedDateTimeToInstant("2026-03-29", "08:00", "Europe/Amsterdam").toISOString()).toBe("2026-03-29T06:00:00.000Z");
  });

  it("biedt de Europese zones aan en bevat altijd de standaardzone", () => {
    const zones = europeanTimeZones();
    expect(zones).toContain("Europe/Amsterdam");
    expect(zones.every((z) => z.startsWith("Europe/"))).toBe(true);
    expect(zones).toEqual([...zones].sort());
  });
});

import { observesDaylightSaving, isDaylightSavingTime } from "./office-timezone";
describe("zomertijd", () => {
  it("Amsterdam heeft zomertijd in juli en niet in januari; Curacao nooit", () => {
    const july = new Date("2026-07-15T12:00:00Z");
    const january = new Date("2026-01-15T12:00:00Z");
    expect(observesDaylightSaving("Europe/Amsterdam", july)).toBe(true);
    expect(isDaylightSavingTime("Europe/Amsterdam", july)).toBe(true);
    expect(isDaylightSavingTime("Europe/Amsterdam", january)).toBe(false);
    expect(observesDaylightSaving("America/Curacao", july)).toBe(false);
    expect(isDaylightSavingTime("America/Curacao", july)).toBe(false);
  });
});
