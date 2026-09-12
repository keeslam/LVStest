/**
 * Wave 9 clean-up — the two items the plan carried to the end.
 *
 * BUG-057 — the audit confirmed the dev-gating of the stack-trace response is
 * correct and asked for a loud start-up assertion when a process that would
 * hand out stack traces is not in production mode.
 *
 * BUG-146 — the state-machine warning now travels in the PATCH response
 * (wave 4). The rule for reading it lives in client/src/lib/status-warning.ts;
 * the response half is asserted here so the two cannot drift apart.
 */
import { describe, it, expect } from "vitest";
import { startupWarnings, looksDeployed, logStartupWarnings } from "../startup-checks";
import { statusChangeWarning } from "../../client/src/lib/status-warning";

describe("BUG-057 — the start-up assertion about NODE_ENV", () => {
  it("says nothing when the process is in production", () => {
    expect(startupWarnings({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("says nothing during the test suite, which sets NODE_ENV=test on purpose", () => {
    expect(startupWarnings({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("warns in development, and names the consequence rather than just the setting", () => {
    const warnings = startupWarnings({ NODE_ENV: "development" } as NodeJS.ProcessEnv);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("NODE_ENV_NOT_PRODUCTION");
    const text = warnings[0].lines.join(" ");
    expect(text).toMatch(/stack trace/i);
    expect(text).toMatch(/BUG-057/);
    expect(text).toMatch(/NODE_ENV=production/);
  });

  it("warns when NODE_ENV is not set at all", () => {
    expect(startupWarnings({} as NodeJS.ProcessEnv)).toHaveLength(1);
  });

  it("is louder when the process also looks deployed", () => {
    const laptop = startupWarnings({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    const deployed = startupWarnings({
      NODE_ENV: "development",
      COOLIFY_FQDN: "app.example.com",
    } as unknown as NodeJS.ProcessEnv);

    expect(deployed[0].lines.join(" ")).toMatch(/LOOKS DEPLOYED/);
    expect(laptop[0].lines.join(" ")).not.toMatch(/LOOKS DEPLOYED/);
    expect(deployed[0].lines.length).toBeGreaterThan(laptop[0].lines.length);
  });

  it("recognises the hosting platforms this application is actually run on", () => {
    expect(looksDeployed({ COOLIFY_URL: "https://x" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(looksDeployed({ KUBERNETES_SERVICE_HOST: "10.0.0.1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(looksDeployed({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("prints every line it produced", () => {
    const printed: string[] = [];
    const count = logStartupWarnings(
      { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      (line) => printed.push(line),
    );

    expect(count).toBe(1);
    expect(printed.length).toBeGreaterThan(4);
  });
});

describe("BUG-146 — the warning that has to reach the screen", () => {
  it("reads the warning out of the PATCH response", () => {
    expect(
      statusChangeWarning({
        id: 1762,
        availabilityStatus: "needs_fixing",
        warning: "Vehicle has upcoming booked reservations. Changing status may require rescheduling those bookings.",
      }),
    ).toMatch(/upcoming booked reservations/);
  });

  it("has nothing to show for an ordinary response", () => {
    expect(statusChangeWarning({ id: 1762, availabilityStatus: "available" })).toBeNull();
    expect(statusChangeWarning(null)).toBeNull();
    expect(statusChangeWarning(undefined)).toBeNull();
    expect(statusChangeWarning("not an object")).toBeNull();
    expect(statusChangeWarning({ warning: "" })).toBeNull();
    expect(statusChangeWarning({ warning: "   " })).toBeNull();
    expect(statusChangeWarning({ warning: 42 })).toBeNull();
  });
});
