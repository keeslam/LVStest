/**
 * "Meldingen" on the portal dashboard (audit 2026-10-09, A-15-5): a notification
 * saved with column names ("emailForMOT") reads as words, also the ones already stored.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({ openPortalRequestDialog: vi.fn(), openFineDialog: vi.fn(), openReservationDialog: vi.fn(), openCustomerDialog: vi.fn(), openVehicleDialog: vi.fn(), openPortalListDialog: vi.fn() }),
}));

import { NotificationsPanel } from "@/components/portal-admin/dashboard-panels";

describe("meldingen op het portaaldashboard", () => {
  it("replaces field names in a stored company-address notification", () => {
    const notifications = [
      { id: 1, type: "portal_customer_update", title: "E-mailadressen gewijzigd: Klant BV", description: "Jan heeft via het portaal bijgewerkt: emailForMOT, emailForInvoices, emailGeneral.", link: "/customers/1", isRead: false, createdAt: new Date().toISOString() },
      { id: 2, type: "portal_request", title: "Nieuwe aanvraag", description: "Er is een vraag over emailForMOT in de tekst.", link: "", isRead: true, createdAt: new Date().toISOString() },
    ];
    render(<QueryClientProvider client={new QueryClient()}><NotificationsPanel notifications={notifications} unread={1} /></QueryClientProvider>);
    expect(screen.getByTestId("notification-1")).toHaveTextContent("bijgewerkt: APK-adres, factuuradres, algemeen e-mailadres.");
    expect(screen.getByTestId("notification-1")).not.toHaveTextContent("emailForMOT");
    // Only this one kind of notification is rewritten; other text stays as written.
    expect(screen.getByTestId("notification-2")).toHaveTextContent("emailForMOT");
  });
});
