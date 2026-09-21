import { test, expect, settle } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { PAGES } from "../registry/pages";
import { pageAccessFor } from "../../shared/page-access";
import { permissionLabel } from "../../shared/permission-labels";
import { E2E } from "../support/env";
import { request as newApiRequestContext } from "@playwright/test";

/**
 * B-28 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2) —
 * `ProtectedRoute` now renders `NoAccessPage` for a known address the role
 * may not open, and never mounts the page component, so the typed-address
 * case used to need a workaround here (`console: false` plus an `allow` for
 * the page's own now-refused requests) is gone: the strict `health` fixture
 * (e2e/support/guards.ts) judges the typed address directly, same as
 * pages.spec.ts does for a page the role MAY use.
 *
 * URLs the persistent header/sidebar chrome may legitimately call on ANY
 * page, independent of which page is open — each gated by its OWN
 * permission (Task 2), not the page's. A typed forbidden address must never
 * cause any /api/ request outside this list (proof the page component was
 * never mounted):
 *  - /api/user: AuthProvider's bootstrap query, unconditional for anyone
 *    logged in.
 *  - /api/vehicles, /api/vehicles/apk-expiring, /api/vehicles/warranty-expiring:
 *    NotificationCenter and/or NotificationCenterDialog, gated on
 *    VIEW_VEHICLES/MANAGE_VEHICLES.
 *  - /api/reservations/upcoming, /api/placeholder-reservations/needing-assignment:
 *    same two components, gated on VIEW_RESERVATIONS/MANAGE_RESERVATIONS.
 *  - /api/reservations/upcoming-maintenance: same two, gated on
 *    VIEW_RESERVATIONS/MANAGE_RESERVATIONS/MANAGE_MAINTENANCE (3-way OR,
 *    server/routes.ts:2659).
 *  - /api/custom-notifications, /api/custom-notifications/unread: gated on
 *    MANAGE_NOTIFICATIONS (task-6-report.md finding 1, task-6b, and Task 2's
 *    remaining half of NotificationCenterDialog).
 *  - /api/customers: NotificationCenterDialog, gated on
 *    VIEW_CUSTOMERS/MANAGE_CUSTOMERS.
 *  - /api/portal-admin/unread-count: sidebar-nav.tsx and PortalAlertChip,
 *    both gated on VIEW_PORTAL/MANAGE_PORTAL.
 *  - /api/apk-date-changes: ApkDateChangesDialog (client/src/App.tsx,
 *    mounted for every logged-in user — NOT inside MainLayout, so out of
 *    this task's stated scope: the design spec's §2 names only "header
 *    widgets in MainLayout"). It has no permission gate of its own on the
 *    client and its mount guard (server/index.ts:419) is
 *    VIEW_VEHICLES/MANAGE_VEHICLES. FINDING (not fixed here, reported):
 *    latent today because all seven E2E profiles hold VIEW_VEHICLES
 *    (e2e/seed/users.ts), so it never actually 403s in this suite — the
 *    moment a profile without VIEW_VEHICLES/MANAGE_VEHICLES is added, this
 *    would need the same treatment as NotificationCenterDialog got here.
 */
const HEADER_ALLOWED_PATHS = [
  "/api/user",
  "/api/apk-date-changes",
  "/api/vehicles",
  "/api/vehicles/apk-expiring",
  "/api/vehicles/warranty-expiring",
  "/api/reservations/upcoming",
  "/api/reservations/upcoming-maintenance",
  "/api/placeholder-reservations/needing-assignment",
  "/api/custom-notifications",
  "/api/custom-notifications/unread",
  "/api/customers",
  "/api/portal-admin/unread-count",
];

function isHeaderAllowed(url: string): boolean {
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  return HEADER_ALLOWED_PATHS.includes(path);
}

/** Asserts the no-access page is showing, names every permission the address needs, and fired nothing but the header's own allowed requests. */
async function expectNoAccess(page: import("@playwright/test").Page, anyOf: readonly string[]) {
  const apiRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/")) apiRequests.push(req.url());
  });

  const noAccess = page.getByTestId("no-access-page");
  await expect(noAccess).toBeVisible();
  await expect(noAccess).toContainText("U heeft geen toegang tot dit scherm");
  for (const permission of anyOf) {
    await expect(noAccess).toContainText(`'${permissionLabel(permission)}'`);
  }

  const unexpected = apiRequests.filter((url) => !isHeaderAllowed(url));
  expect(unexpected, "no /api/ request beyond the header's allowed ones").toEqual([]);
}

for (const role of ROLES.filter((candidate) => candidate !== "admin")) {
  test.describe(`pages ${role} may not use`, () => {
    test.use({ storageState: authFile(role) });
    // A parameterised path (currently only "/reservations/edit/:id") needs a
    // real id to navigate to; resolving one for every role complicated this
    // spec more than the page was worth here. Covered separately below, per
    // Task 1's ruling, with a seeded reservation id.
    for (const entry of PAGES.filter((candidate) => !can(role, candidate.anyOf) && !candidate.path.includes(":"))) {
      test(`${entry.path}: not offered, data refused, no crash`, async ({ page, request, health }) => {
        // entry.api is null when no GET route this page depends on is guarded
        // consistently with its sidebar entry — see e2e/registry/pages.ts and
        // task-6-report.md, "Findings for the owner". Nothing to assert then;
        // the other checks below still apply.
        if (entry.api !== null) {
          const refused = await request.get(entry.api);
          expect(refused.status(), `GET ${entry.api}`).toBe(403);
        }

        await page.goto("/");
        await settle(page);
        await expect(page.locator(`nav a[href="${entry.path}"]`)).toHaveCount(0);

        // The typed address: ProtectedRoute now shows the no-access page
        // instead of mounting the page component, so this fires nothing of
        // its own — the strict `health` fixture (no allowlist) judges it.
        await page.goto(entry.path);
        await settle(page);

        await expectNoAccess(page, entry.anyOf);
      });
    }
  });
}

// Task 1's ruling (progress.md): "/reservations/edit/:id" was left out of the
// per-role loop above; Task 2 must cover it directly with a seeded id.
test.describe("/reservations/edit/:id (covered directly, per Task 1's ruling)", () => {
  const EDIT_ANY_OF = pageAccessFor("/reservations/edit/:id")?.anyOf ?? [];
  let reservationId: number;

  test.beforeAll(async () => {
    // A request context authenticated as admin, independent of whichever
    // role the tests below use — the seed's reservation ids are not fixed,
    // and admin can always list them regardless of the tested role's own
    // rights.
    const adminApi = await newApiRequestContext.newContext({ baseURL: E2E.baseUrl, storageState: authFile("admin") });
    try {
      const reservations = await (await adminApi.get("/api/reservations")).json();
      const target = reservations.find((r: { notes?: string }) => r.notes === "e2e:today-booked");
      if (!target) throw new Error('seeded reservation "e2e:today-booked" (e2e/seed/data.ts) not found via GET /api/reservations');
      reservationId = target.id;
    } finally {
      await adminApi.dispose();
    }
  });

  test.describe("cleaner (holds view_reservations, not manage_reservations)", () => {
    test.use({ storageState: authFile("cleaner") });

    test("gets no-access-page and fires no /api/reservations/:id request", async ({ page, health }) => {
      await page.goto(`/reservations/edit/${reservationId}`);
      await settle(page);

      await expectNoAccess(page, EDIT_ANY_OF);
    });
  });

  test.describe("user (holds manage_reservations)", () => {
    test.use({ storageState: authFile("user") });

    test("opens the edit page without a fault", async ({ page, health }) => {
      await page.goto(`/reservations/edit/${reservationId}`);
      await settle(page);

      await expect(page.getByRole("heading", { name: "Reservering bewerken" })).toBeVisible();
      await expect(page.getByTestId("no-access-page")).toHaveCount(0);
    });
  });
});
