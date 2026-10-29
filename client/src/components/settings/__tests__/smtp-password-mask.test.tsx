/**
 * C2 — het SMTP-wachtwoord komt als masker terug (server: server/__tests__/app-settings-secrets.test.ts).
 *
 * The settings panel is too large to render in jsdom (the office-address test next to this one
 * reads the source for the same reason), so this pins the places where the dialog has to
 * cooperate with the mask, plus the fuel-policy query of the reservation form.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
const panel = read("client/src/components/settings/settings-panel.tsx");

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  expect(from, start).toBeGreaterThan(-1);
  return source.slice(from, source.indexOf(end, from));
};

describe("het e-maildialoog en het wachtwoordmasker", () => {
  it("stuurt bij 'Verbinding testen' het id van de opgeslagen instelling mee", () => {
    const test = between(panel, "const testSmtpConnectionMutation", "const resetEmailForm");
    expect(test).toMatch(/id:\s*editingEmail\?\.id/);
  });

  it("toont waarom een geweigerde opslag is geweigerd", () => {
    const save = between(panel, "const saveEmailSetting = useMutation", "const testSmtpConnectionMutation");
    expect(save).toContain("onError");
    expect(save).toContain("describeApiError(error)");
  });

  it("legt onder het wachtwoordveld uit dat de sterretjes het wachtwoord bewaren", () => {
    const field = between(panel, 'data-testid="input-smtp-password"', 'data-testid="button-test-smtp-connection"');
    expect(field).toContain("settingsPage.email.passwordKeptHint");
  });
});

describe("het brandstofbeleid in het reserveringsformulier", () => {
  it("leest business_rules via de sleutelroute", () => {
    const form = read("client/src/components/reservations/reservation-form.tsx");
    expect(form).toContain('queryKey: ["/api/app-settings/key/business_rules"]');
    expect(form).not.toContain('["/api/app-settings", "business_rules"]');
  });
});
