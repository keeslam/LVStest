/**
 * D17 (besluiten D, spec §13): Instellingen > Voertuigen > "RDW-voertuigtypes".
 *
 * "Controleren" starts a background check and shows its progress; the stored plan is listed
 * (dashed plates, old -> new type); "Toepassen" is for the role admin only and asks for a
 * confirmation that names the count before it applies exactly that plan.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";
import type { RdwTypeRemapJob } from "@shared/rdw-type-remap";

const toasts: Array<{ title?: string; description?: string; variant?: string }> = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: any) => { toasts.push(t); } }),
}));

let currentUser: { id: number; username: string; role: string; permissions: string[] };
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: currentUser, isLoading: false }),
}));

import { RdwTypeRemapCard } from "@/components/settings/rdw-type-remap-card";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const idleJob: RdwTypeRemapJob = { status: "idle", total: 0, checked: 0, startedAt: null, finishedAt: null, errorCode: null };
const plan = {
  createdAt: "2026-10-11T09:30:00.000Z",
  checked: 99,
  rows: [
    { id: 11, plate: "AB12CD", from: "SUV", to: "Van" },
    { id: 12, plate: "XY99ZZ", from: null, to: "Sedan" },
  ],
  notFound: ["NF11NF"],
  failed: ["FA22FA", "FA33FA"],
};

let status: { job: RdwTypeRemapJob; plan: typeof plan | null };
let posts: Array<{ url: string }>;
let applyAnswer: { status: number; body: unknown };

beforeEach(() => {
  toasts.length = 0;
  posts = [];
  status = { job: idleJob, plan: null };
  applyAnswer = { status: 200, body: { applied: 1, skipped: 1 } };
  currentUser = { id: 1, username: "kees", role: UserRole.ADMIN, permissions: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      posts.push({ url });
      if (url.endsWith("/check")) {
        status = { job: { ...idleJob, status: "running", total: 10, checked: 3, startedAt: "2026-10-11T09:29:00.000Z" }, plan: status.plan };
        return json({ job: status.job }, 202);
      }
      if (url.endsWith("/apply")) return json(applyAnswer.body, applyAnswer.status);
    }
    if (url.includes("/api/vehicles/rdw-type-remap/plan")) return json(status);
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RdwTypeRemapCard />
    </QueryClientProvider>,
  );
}

describe("RDW-voertuigtypes card", () => {
  it("says there is no check yet and offers Controleren", async () => {
    renderCard();
    const card = await screen.findByTestId("card-rdw-type-remap");
    expect(within(card).getByText("RDW-voertuigtypes")).toBeInTheDocument();
    expect(await within(card).findByTestId("text-rdw-remap-no-plan")).toBeInTheDocument();
    expect(within(card).getByTestId("button-rdw-remap-check")).toBeEnabled();
    // Nothing to apply yet.
    expect(within(card).getByTestId("button-rdw-remap-apply")).toBeDisabled();
  });

  it("Controleren starts the check and shows the progress", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByTestId("button-rdw-remap-check"));
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual([expect.stringContaining("/api/vehicles/rdw-type-remap/check")]));
    expect(await screen.findByTestId("text-rdw-remap-progress")).toHaveTextContent("3 van 10");
    expect(screen.getByTestId("button-rdw-remap-check")).toBeDisabled();
    expect(screen.getByTestId("button-rdw-remap-apply")).toBeDisabled();
  });

  it("lists the plan: dashed plates, old -> new type, and what was not checked", async () => {
    status = { job: { ...idleJob, status: "done", total: 99, checked: 99 }, plan };
    renderCard();
    const first = await screen.findByTestId("rdw-remap-row-11");
    expect(first).toHaveTextContent("AB-12-CD");
    expect(first).toHaveTextContent("SUV");
    expect(first).toHaveTextContent("Van");
    const second = screen.getByTestId("rdw-remap-row-12");
    expect(second).toHaveTextContent("XY-99-ZZ");
    expect(second).toHaveTextContent("Sedan");
    expect(screen.getByTestId("text-rdw-remap-summary")).toHaveTextContent("2 voertuigen");
    expect(screen.getByTestId("text-rdw-remap-summary")).toHaveTextContent("1 niet gevonden");
    expect(screen.getByTestId("text-rdw-remap-summary")).toHaveTextContent("2 mislukt");
  });

  it("Toepassen asks for confirmation with the count and then applies", async () => {
    const user = userEvent.setup();
    status = { job: { ...idleJob, status: "done", total: 99, checked: 99 }, plan };
    renderCard();
    await user.click(await screen.findByTestId("button-rdw-remap-apply"));
    expect(posts).toHaveLength(0); // not before the confirmation
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(within(dialog).getByTestId("confirm-dialog-description")).toHaveTextContent("2 voertuigen");

    await user.click(within(dialog).getByTestId("button-rdw-remap-apply-confirm"));
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual([expect.stringContaining("/api/vehicles/rdw-type-remap/apply")]));
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(String(toasts[0].description)).toMatch(/1 voertuig/);
    expect(String(toasts[0].description)).toMatch(/1 overgeslagen/);
  });

  it("words a refused apply by its code, not by the English text", async () => {
    const user = userEvent.setup();
    status = { job: { ...idleJob, status: "done", total: 99, checked: 99 }, plan };
    applyAnswer = { status: 409, body: { message: "There is no RDW type plan to apply", code: "REMAP_PLAN_MISSING" } };
    renderCard();
    await user.click(await screen.findByTestId("button-rdw-remap-apply"));
    await user.click(await screen.findByTestId("button-rdw-remap-apply-confirm"));
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(String(toasts[0].description)).toMatch(/Controleren/);
    expect(String(toasts[0].description)).not.toMatch(/There is no/);
    expect(toasts[0].variant).toBe("destructive");
  });

  it("a manager with MANAGE_VEHICLES can check but has no Toepassen button", async () => {
    currentUser = { id: 2, username: "manager", role: UserRole.MANAGER, permissions: [UserPermission.MANAGE_VEHICLES] };
    status = { job: { ...idleJob, status: "done", total: 99, checked: 99 }, plan };
    renderCard();
    expect(await screen.findByTestId("button-rdw-remap-check")).toBeEnabled();
    await screen.findByTestId("rdw-remap-row-11");
    expect(screen.queryByTestId("button-rdw-remap-apply")).not.toBeInTheDocument();
  });

  it("shows nothing for an account without MANAGE_VEHICLES", () => {
    currentUser = { id: 3, username: "viewer", role: UserRole.USER, permissions: [UserPermission.VIEW_VEHICLES] };
    renderCard();
    expect(screen.queryByTestId("card-rdw-type-remap")).not.toBeInTheDocument();
  });
});
