/**
 * Rapporten fase 6, afronding a: every kit report refuses without its rights (403) and without
 * login (401), on summary, rows and export. A later-mounted report that is missing from the list
 * below turns the first test red.
 */
import { describe, it, expect, afterAll } from "vitest";

const { agentFor, anonAgent, makeApp, cleanupFixtureUsers } = await import("./helpers/app");

type Agent = Awaited<ReturnType<typeof agentFor>>;

const REPORTS: Array<{ path: string; tile: string; denied: string[][] }> = [
  { path: "fines", tile: "total", denied: [["view_fines", "manage_fines", "view_vehicles"]] },
  { path: "extra-costs", tile: "extraKm", denied: [["view_reservations", "manage_reservations"]] },
  { path: "transport-billing", tile: "notInvoiced", denied: [["view_vehicles", "view_reservations"]] },
  { path: "customer-value", tile: "revenue", denied: [["view_customers", "manage_customers"]] },
  { path: "occupancy", tile: "rented", denied: [["view_reports"], ["view_reservations", "manage_reservations"]] },
  { path: "maintenance-outlook", tile: "all", denied: [["view_reports"], ["view_vehicles", "manage_vehicles"]] },
  { path: "fleet-mileage", tile: "driven", denied: [["view_reports", "manage_reports", "view_vehicles", "manage_vehicles"]] },
  { path: "portal-requests", tile: "all", denied: [["view_reports"], ["view_portal", "manage_portal"]] },
  { path: "waitlist", tile: "all", denied: [["view_reports"], ["view_portal", "manage_portal"]] },
  { path: "invoice-inbox-runs", tile: "runs", denied: [["view_reports"], ["manage_expenses", "manage_settings"]] },
  { path: "invoice-inbox-items", tile: "all", denied: [["view_reports", "manage_settings"], ["manage_expenses"]] },
  { path: "deliveries", tile: "all", denied: [["view_reports", "view_damage_checks"], ["view_vehicles", "view_reservations"]] },
  { path: "damage-checks", tile: "all", denied: [["view_reports", "view_vehicles"], ["view_damage_checks", "manage_damage_checks"]] },
];
const urls = (r: (typeof REPORTS)[number]) => [
  `/api/reports/${r.path}/summary`,
  `/api/reports/${r.path}/rows?tile=${r.tile}`,
  `/api/reports/${r.path}/export?tile=${r.tile}`,
];

function collectRoutes(app: any): Array<{ key: string }> {
  const seen = new Map<string, { key: string }>();
  for (const layer of app._router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods).filter((m) => layer.route.methods[m])) {
      const key = `${method.toUpperCase()} ${layer.route.path}`;
      if (!seen.has(key)) seen.set(key, { key });
    }
  }
  return [...seen.values()];
}

const agents = new Map<string, Agent>();
async function agentOf(perms: string[]): Promise<Agent> {
  const k = [...perms].sort().join(",");
  let a = agents.get(k);
  if (!a) {
    a = await agentFor(perms);
    agents.set(k, a);
  }
  return a;
}

afterAll(async () => {
  await cleanupFixtureUsers();
});

describe("rapportroutes: rechten en inloggen", () => {
  it("elk rapport van de kit staat in deze lijst", async () => {
    const app = await makeApp();
    const mounted = collectRoutes(app)
      .map((r) => /^GET \/api\/reports\/([^/]+)\/summary$/.exec(r.key)?.[1])
      .filter(Boolean)
      .sort();
    expect(mounted).toEqual(REPORTS.map((r) => r.path).sort());
  }, 60_000);

  it.each(REPORTS)("$path: 403 zonder het juiste recht op summary, rows en export", async (r) => {
    for (const perms of r.denied) {
      const agent = await agentOf(perms);
      for (const url of urls(r)) {
        expect((await agent.agent.get(url)).status, `${perms.join("+")} ${url}`).toBe(403);
      }
    }
  }, 60_000);

  it.each(REPORTS)("$path: 401 zonder inloggen", async (r) => {
    const anon = await anonAgent();
    for (const url of urls(r)) expect((await anon.agent.get(url)).status, url).toBe(401);
  }, 60_000);
});
