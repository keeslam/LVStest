/**
 * BUG-213 — "Een tabblad waarvan de sessie beëindigd is, toont gecachete
 * gegevens door en gaat nooit naar de loginpagina."
 *
 * The pure rule (which 401 counts as an expiry) is unit-tested in
 * `client/src/lib/__tests__/fix-q-client-robustness.test.ts`. What is tested
 * here is the wiring the audit actually observed failing: a mounted screen with
 * rows already on it, a session that ends server-side, and the question whether
 * the tab keeps showing those rows. It must not — the cache is emptied and the
 * browser goes to the login page.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";

const STAFF_USER = { id: 7, username: "medewerker", role: "user", hidePrices: false };

/** One ordinary staff screen: it asks for rows and renders what it got. */
function VehicleList() {
  const { data } = useQuery<Array<{ id: number; licensePlate: string }>>({
    queryKey: ["/api/vehicles"],
  });
  return (
    <ul>
      {(data ?? []).map((v) => (
        <li key={v.id}>{v.licensePlate}</li>
      ))}
    </ul>
  );
}

function jsonResponse(body: unknown, status = 200, url = "http://localhost/api/x") {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  // `Response.url` is read-only and empty for a hand-built response; the 401
  // rule reads it, so it has to be the URL that was actually requested.
  Object.defineProperty(response, "url", { value: url });
  return response;
}

let sessionAlive = true;
let hrefs: string[] = [];
let originalLocation: Location;

beforeEach(() => {
  sessionAlive = true;
  hrefs = [];
  queryClient.clear();

  originalLocation = window.location;
  // jsdom refuses a real navigation; record the attempt instead.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      ...originalLocation,
      get href() {
        return hrefs[hrefs.length - 1] ?? "http://localhost/vehicles";
      },
      set href(value: string) {
        hrefs.push(value);
      },
      reload: () => {},
    },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);

      if (url.startsWith("/api/logout")) return jsonResponse({ ok: true }, 200, url);
      // A wrong password answers 401 too — and must never be read as an expiry.
      if (url.startsWith("/api/login")) {
        return jsonResponse({ message: "Invalid credentials" }, 401, url);
      }
      if (url.startsWith("/api/user")) {
        return sessionAlive
          ? jsonResponse(STAFF_USER, 200, url)
          : jsonResponse({ message: "Unauthorized" }, 401, url);
      }
      if (url.startsWith("/api/vehicles")) {
        return sessionAlive
          ? jsonResponse([{ id: 1, licensePlate: "12-AB-34" }], 200, url)
          : jsonResponse({ message: "Session expired" }, 401, url);
      }
      return jsonResponse({}, 200, url);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
  queryClient.clear();
});

describe("BUG-213 — an expired session does not keep serving cached rows", () => {
  it("clears the cache and goes to the login page when a staff GET answers 401", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <VehicleList />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // The tab is working normally: rows on screen, rows in the cache.
    await waitFor(() => expect(screen.getByText("12-AB-34")).toBeInTheDocument());
    expect(queryClient.getQueryData(["/api/vehicles"])).toBeTruthy();

    // The session ends server-side (timeout, restart, admin logout).
    sessionAlive = false;

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/vehicles"] }).catch(() => undefined);
    });

    // Nothing stale is left to render...
    await waitFor(() => expect(queryClient.getQueryData(["/api/vehicles"])).toBeUndefined());
    // ...and the tab is on its way to the login page instead of sitting there.
    await waitFor(() => expect(hrefs).toContain("/auth"));
    // The whole cache went, not just the one query: the next screen this tab
    // renders cannot be served from anything the expired session fetched.
    // (The DOM still holds the last render for a tick — in the browser the
    // navigation above replaces the document, which is the point of the fix.)
    expect(queryClient.getQueryData(["/api/user"])).toBeFalsy();
  });

  it("a 401 from the login form itself does not bounce the page", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <VehicleList />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("12-AB-34")).toBeInTheDocument());

    const { apiRequest } = await import("@/lib/queryClient");
    await act(async () => {
      await apiRequest("POST", "/api/login", { username: "x", password: "wrong" }).catch(
        () => undefined,
      );
    });

    // A wrong password must show its message on the form, not empty the tab.
    expect(hrefs).not.toContain("/auth");
    expect(screen.getByText("12-AB-34")).toBeInTheDocument();
  });
});
