import { describe, it, expect } from "vitest";
import { parseAppointmentMail, replacementWanted, appointmentCategory, isPlannerMailSubject } from "./online-appointments";

// The text of the real mail of 13-10-2026 (a test appointment in the planner), as mailparser gives it.
const REAL = `Afspraak Aanvraag

Geachte Dhr. Kees Lam,

Wij hebben uw verzoek voor het maken van een werkplaatsafspraak voor uw RENAULT TWINGO met
kenteken XX-LL-20 succesvol ontvangen.

U wil een afspraak maken voor 30-10-2026 om 08:00.
Wij zullen de afspraak inplannen en zo spoedig mogelijk de afspraak bevestigen.

Voertuig gegevens:
Kenteken: XX-LL-20
Merk: RENAULT
Model: TWINGO
Tellerstand: 120

Werkzaamheden:
APK


Vervangend vervoer:
Leenauto

Met vriendelijke groet,

Autobedrijf Bernisse

Copyright © Autobedrijf Bernisse, All rights reserved.`;

describe("the planner's Afspraak Aanvraag mail", () => {
  it("is read into date, time, plate, car, work, replacement car and customer", () => {
    expect(parseAppointmentMail(REAL)).toEqual({
      date: "2026-10-30", time: "08:00", plate: "XXLL20", brand: "RENAULT", model: "TWINGO", mileage: 120,
      workItems: ["APK"], replacement: "Leenauto", customerName: "Dhr. Kees Lam",
    });
  });

  it("reads several work items, one per line or separated by commas, and an empty replacement", () => {
    const text = REAL.replace("Werkzaamheden:\nAPK", "Werkzaamheden:\nAPK\nGrote beurt, Airco controle").replace("Vervangend vervoer:\nLeenauto", "Vervangend vervoer:\n");
    const parsed = parseAppointmentMail(text)!;
    expect(parsed.workItems).toEqual(["APK", "Grote beurt", "Airco controle"]);
    expect(parsed.replacement).toBe("");
  });

  it("copes with a label and its value on the same line, non-breaking spaces and carriage returns", () => {
    const text = REAL.replace(/\n/g, "\r\n").replace("Kenteken: XX-LL-20", "Kenteken: xx-ll-20").replace("Werkzaamheden:\r\nAPK", "Werkzaamheden: APK");
    const parsed = parseAppointmentMail(text)!;
    expect(parsed.plate).toBe("XXLL20");
    expect(parsed.workItems).toEqual(["APK"]);
    expect(parsed.date).toBe("2026-10-30");
  });

  it("gives nothing when the date, the time or the plate cannot be read with certainty", () => {
    expect(parseAppointmentMail(REAL.replace("30-10-2026 om 08:00", "volgende week"))).toBeNull();
    expect(parseAppointmentMail(REAL.replace("30-10-2026", "31-02-2026"))).toBeNull();
    expect(parseAppointmentMail(REAL.replace("om 08:00", "om 25:00"))).toBeNull();
    expect(parseAppointmentMail(REAL.replace("Kenteken: XX-LL-20", "Kenteken:"))).toBeNull();
    expect(parseAppointmentMail("Geachte klant, hierbij uw factuur.")).toBeNull();
  });

  it("has no mileage when it is not a number", () => {
    expect(parseAppointmentMail(REAL.replace("Tellerstand: 120", "Tellerstand: onbekend"))!.mileage).toBeNull();
  });
});

describe("replacement car", () => {
  it("is wanted for any name, and not for empty, geen or nee", () => {
    for (const yes of ["Leenauto", "Vervangende auto", "Taxi"]) expect(replacementWanted(yes)).toBe(true);
    for (const no of ["", "  ", "geen", "Geen", "nee", "Nee", "-", null, undefined]) expect(replacementWanted(no)).toBe(false);
  });
});

describe("category in the maintenance planner", () => {
  it("is regular maintenance only for APK, and a repair for anything else", () => {
    expect(appointmentCategory(["APK"])).toBe("scheduled_maintenance");
    expect(appointmentCategory(["APK keuring"])).toBe("scheduled_maintenance");
    expect(appointmentCategory(["APK", "Grote beurt"])).toBe("repair");
    expect(appointmentCategory(["APK", "Reparatie uitvoeren (graag bij opmerkingen vermelden)"])).toBe("repair");
    expect(appointmentCategory(["Vervangen remblokken voor"])).toBe("repair");
    expect(appointmentCategory([])).toBe("repair");
  });
});

describe("which mail is an appointment mail", () => {
  it("looks at the subject Afspraak Aanvraag", () => {
    expect(isPlannerMailSubject("Afspraak Aanvraag")).toBe(true);
    expect(isPlannerMailSubject("afspraak-aanvraag")).toBe(true);
    expect(isPlannerMailSubject("Uw afspraak is bevestigd")).toBe(false);
    expect(isPlannerMailSubject("Factuur 2026-100")).toBe(false);
    expect(isPlannerMailSubject(null)).toBe(false);
  });
});
