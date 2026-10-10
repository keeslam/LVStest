/**
 * Audit remediation P5, A-3-14 - an available vehicle with an expired APK was
 * offered in the reservation form without a word. The form warns (it does not
 * block - the owner decides whether an expired inspection is a problem): in the
 * vehicle picker, and under the field for a vehicle the form was opened with.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { VehicleSelector } from "@/components/ui/vehicle-selector";

vi.mock("@/components/reservations/reservation-add-dialog", () => ({
  ReservationAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/expenses/expense-add-dialog", () => ({
  ExpenseAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/documents/inline-document-upload", () => ({
  InlineDocumentUpload: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: () => null,
  ReturnDialog: () => null,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

const expired = {
  id: 2001, licensePlate: "2XJT31", brand: "Mitsubishi", model: "Spacestar",
  vehicleType: "Hatchback", apkDate: "2026-02-27", availabilityStatus: "available", currentMileage: 1000,
};
const valid = {
  id: 2002, licensePlate: "AB123C", brand: "Fiat", model: "Ducato",
  vehicleType: "Van", apkDate: "2999-01-01", availabilityStatus: "available", currentMileage: 1000,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url === "/api/vehicles") return json([expired, valid]);
    if (url === `/api/vehicles/${expired.id}`) return json(expired);
    if (url === `/api/vehicles/${valid.id}`) return json(valid);
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderForm(initialVehicleId: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ReservationForm initialVehicleId={String(initialVehicleId)} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("A-3-14 - the reservation form warns about an expired APK", () => {
  it("warns under a vehicle the form was opened with", async () => {
    renderForm(expired.id);
    const warning = await screen.findByTestId("apk-expired-warning");
    expect(warning).toHaveTextContent(/APK/);
    expect(warning).toHaveTextContent(/verlopen/i);
  });

  it("stays quiet for a vehicle with a valid APK", async () => {
    renderForm(valid.id);
    await screen.findByText("Fiat Ducato");
    expect(screen.queryByTestId("apk-expired-warning")).toBeNull();
  });
});

describe("A-3-14 - the vehicle picker marks an expired APK", () => {
  it("shows a badge on the expired vehicle only, and only when asked to", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <VehicleSelector vehicles={[expired, valid] as any} value="" onChange={() => {}} warnExpiredApk />,
    );
    await user.click(screen.getByRole("button"));
    expect(await screen.findAllByTestId("vehicle-apk-expired")).toHaveLength(1);

    rerender(<VehicleSelector vehicles={[expired, valid] as any} value="" onChange={() => {}} />);
    expect(screen.queryAllByTestId("vehicle-apk-expired")).toHaveLength(0);
  });
});
