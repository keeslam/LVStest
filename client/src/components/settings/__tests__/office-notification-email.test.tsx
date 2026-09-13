/**
 * WAVE 15 item 3 — het kantooradres voor meldingen, de schermkant.
 *
 * The server has read `notification_office_email` since WAVE 11 (besluit
 * **B-24**: an APK reminder for a car nobody rents goes to the office), but no
 * screen had a field for it. The eindrapport listed it as an open question:
 * "die instelling wordt gelezen, maar er is **geen veld in enig beheerscherm**
 * om hem te zetten".
 *
 * What the field has to say for itself: a Dutch label, a helper text that names
 * what the address is used for, and — because an empty field is not a broken
 * one — the sender address it falls back to.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfficeNotificationEmail } from "@/components/settings/office-notification-email";

const noop = () => {};

describe("het veld voor het kantooradres", () => {
  it("heeft een Nederlands label en legt uit waar het adres voor dient", () => {
    render(<OfficeNotificationEmail value="" senderEmail="noreply@lamgroep.test" onChange={noop} onSave={noop} />);

    // The label is bound to the field, not floating next to it.
    expect(screen.getByLabelText(/kantooradres voor meldingen/i))
      .toBe(screen.getByTestId("input-notification-office-email"));

    const help = screen.getByTestId("help-notification-office-email");
    // It has to say what it is *for*, not just what it is.
    expect(help.textContent?.toLowerCase()).toContain("geen huurder");
    expect(help.textContent?.toLowerCase()).toContain("apk");
  });

  it("noemt het afzenderadres waarop de app terugvalt zolang het veld leeg is", () => {
    render(<OfficeNotificationEmail value="" senderEmail="noreply@lamgroep.test" onChange={noop} onSave={noop} />);

    const help = screen.getByTestId("help-notification-office-email");
    expect(help).toHaveTextContent("noreply@lamgroep.test");
    expect(help.textContent?.toLowerCase()).toContain("afzender");
  });

  it("toont de ingevulde waarde en geeft elke wijziging door", () => {
    const onChange = vi.fn();
    render(
      <OfficeNotificationEmail
        value="kantoor@lamgroep.test" senderEmail="noreply@lamgroep.test" onChange={onChange} onSave={noop}
      />,
    );

    const input = screen.getByTestId("input-notification-office-email") as HTMLInputElement;
    expect(input.value).toBe("kantoor@lamgroep.test");

    fireEvent.change(input, { target: { value: "balie@lamgroep.test" } });
    expect(onChange).toHaveBeenCalledWith("balie@lamgroep.test");
  });

  it("slaat op met de knop", () => {
    const onSave = vi.fn();
    render(
      <OfficeNotificationEmail
        value="kantoor@lamgroep.test" senderEmail="noreply@lamgroep.test" onChange={noop} onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId("button-save-notification-office-email"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("zegt dat er geen afzenderadres is in plaats van een leeg zinsdeel", () => {
    render(<OfficeNotificationEmail value="" senderEmail="" onChange={noop} onSave={noop} />);

    const help = screen.getByTestId("help-notification-office-email");
    expect(help.textContent).not.toMatch(/terug op\s*\./);
    expect(help.textContent?.toLowerCase()).toContain("nog geen afzenderadres");
  });
});

describe("het veld staat in het instellingenscherm zelf", () => {
  it("wordt gerenderd op het tabblad waar de andere mailinstellingen staan", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/settings/settings-panel.tsx"), "utf8",
    );
    expect(source).toContain("OfficeNotificationEmail");
    expect(source).toContain("notification_office_email");
    // On the e-mail tab, next to the SMTP configuration it belongs with.
    const emailTab = source.slice(source.indexOf('<TabsContent value="email"'));
    expect(emailTab).toContain("OfficeNotificationEmail");
  });
});
