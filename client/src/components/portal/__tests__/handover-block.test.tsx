/**
 * How a rental starts and ends, as two steps: pickup and return. Each step says where the car is collected or
 * returned: at the shop (address, opening hours) or at a place agreed with the office (brought / collected there).
 * The shop's address only shows for a step that happens at the shop. Tense follows the status: what will happen
 * before it happens, what happened after.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HandoverBlock } from "@/components/portal/handover-block";

const info = {
  pickupAddress: "Kerkweg 47a, 3214 VC Zuidland", openingHours: "Maandag t/m vrijdag 08:00 - 17:00",
  pickupInstructions: "Neem een geldig rijbewijs mee.", returnInstructions: "Lever de auto schoon en compleet in, anders rekenen wij kosten.",
  deliveryNote: "Brengen en halen kan, vanaf € 125.", privacyUrl: "", phone: "0181 - 45 10 40",
};
const shop = { pickup: { method: "shop", location: null }, return: { method: "shop", location: null } } as const;
const away = (pickup: string | null, ret: string | null) => ({
  pickup: pickup === null ? shop.pickup : { method: "delivery", location: pickup },
  return: ret === null ? shop.return : { method: "collection", location: ret },
}) as any;
const base = { id: 1, status: "picked_up", startDate: "2026-10-01", endDate: "2026-10-20", startTime: null, endTime: null, actualPickupDate: "2026-10-01", actualReturnDate: null, handover: shop };
const props = { info, canExtend: true, canReturnEarly: true, onExtend: vi.fn(), onReturnEarly: vi.fn() };
const step = (kind: "pickup" | "return") => screen.getByTestId(`handover-step-${kind}`);

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-12T12:00:00+02:00")); props.onExtend.mockClear(); props.onReturnEarly.mockClear(); });
afterEach(() => vi.useRealTimers());

describe("the car is on the road", () => {
  it("shows the pickup as done (past tense, with its date) and the return as next, with the countdown", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, endTime: "16:30" }} />);
    expect(step("pickup")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("handover-what-pickup")).toHaveTextContent("Opgehaald bij ons");
    expect(screen.getByTestId("handover-when-pickup")).toHaveTextContent("op 01-10-2026");
    expect(step("return")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("handover-what-return")).toHaveTextContent("U levert de auto in bij ons");
    expect(screen.getByTestId("handover-when-return")).toHaveTextContent("20-10-2026 · om 16:30");
    expect(within(step("return")).getByTestId("handover-countdown")).toHaveTextContent("Nog 8 dagen");
    expect(screen.getByTestId("handover-block")).toHaveAttribute("data-state", "return");
  });

  it("gives the shop's address and opening hours for the return at the shop; only the address for the pickup that is behind us", () => {
    render(<HandoverBlock {...props} reservation={base} />);
    expect(screen.getByTestId("handover-shop-return")).toHaveTextContent("Kerkweg 47a");
    expect(screen.getByTestId("handover-shop-return")).toHaveTextContent("08:00 - 17:00");
    expect(screen.getByTestId("handover-shop-pickup")).toHaveTextContent("Kerkweg 47a");
    expect(screen.getByTestId("handover-shop-pickup")).not.toHaveTextContent("08:00 - 17:00");
  });

  it("names where the car was brought and where we will collect it, and shows no shop address at all", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, handover: away("Dorpsstraat 1, 1234 AB Utrecht", "Havenweg 9, Rotterdam") }} />);
    expect(screen.getByTestId("handover-what-pickup")).toHaveTextContent("Gebracht naar Dorpsstraat 1, 1234 AB Utrecht");
    expect(screen.getByTestId("handover-what-return")).toHaveTextContent("Wij halen de auto bij u op Havenweg 9, Rotterdam");
    expect(screen.queryByText(/Kerkweg 47a/)).toBeNull();
    expect(screen.queryByText(/08:00 - 17:00/)).toBeNull();
    expect(screen.queryByTestId("handover-delivery-note")).toBeNull();
  });

  it("mixes: brought to the customer, returned at the shop", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, handover: away("Dorpsstraat 1, Utrecht", null) }} />);
    expect(screen.getByTestId("handover-what-pickup")).toHaveTextContent("Gebracht naar Dorpsstraat 1, Utrecht");
    expect(screen.queryByTestId("handover-shop-pickup")).toBeNull();
    expect(screen.getByTestId("handover-shop-return")).toHaveTextContent("Kerkweg 47a");
  });

  it("always gives the return instructions: clean and complete, or it costs, whoever collects the car", () => {
    const { rerender } = render(<HandoverBlock {...props} reservation={base} />);
    expect(screen.getByTestId("handover-return-instructions")).toHaveTextContent(/schoon en compleet/);
    rerender(<HandoverBlock {...props} reservation={{ ...base, handover: away(null, "Havenweg 9, Rotterdam") }} />);
    expect(screen.getByTestId("handover-return-instructions")).toHaveTextContent(/kosten/);
  });

  it("says 'tomorrow', 'today', and that the time is by arrangement when there is none", () => {
    const { rerender } = render(<HandoverBlock {...props} reservation={{ ...base, endDate: "2026-10-13" }} />);
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("Morgen");
    expect(screen.getByTestId("handover-when-return")).toHaveTextContent("tijdstip in overleg");
    rerender(<HandoverBlock {...props} reservation={{ ...base, endDate: "2026-10-12" }} />);
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("Vandaag");
  });

  it("has no countdown for a rental without an end date, and says so", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, endDate: null }} />);
    expect(screen.queryByTestId("handover-countdown")).toBeNull();
    expect(screen.getByTestId("handover-when-return")).toHaveTextContent(/geen einddatum/i);
  });

  it("turns red when the end date has passed, with Verlengen as the main action and no early return", async () => {
    render(<HandoverBlock {...props} reservation={{ ...base, endDate: "2026-10-09" }} />);
    expect(screen.getByTestId("handover-block")).toHaveAttribute("data-state", "late");
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("3 dagen te laat");
    expect(screen.getByTestId("handover-late")).toHaveTextContent(/verleng de huur of lever de auto in/i);
    await userEvent.click(screen.getByTestId("button-handover-extend"));
    expect(props.onExtend).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("button-handover-early-return")).toBeNull();
  });

  it("offers the buttons only to accounts that may use them", async () => {
    const { rerender } = render(<HandoverBlock {...props} reservation={base} />);
    await userEvent.click(screen.getByTestId("button-handover-early-return"));
    expect(props.onReturnEarly).toHaveBeenCalledTimes(1);
    rerender(<HandoverBlock {...props} canExtend={false} canReturnEarly={false} reservation={base} />);
    expect(screen.queryByTestId("button-handover-extend")).toBeNull();
    expect(screen.queryByTestId("button-handover-early-return")).toBeNull();
  });

  it("tells shop customers that bringing and collecting can be arranged, with the price", () => {
    render(<HandoverBlock {...props} reservation={base} />);
    expect(screen.getByTestId("handover-delivery-note")).toHaveTextContent("vanaf € 125");
  });
});

describe("the rental has not started", () => {
  const booked = { ...base, status: "booked", startDate: "2026-10-15", startTime: "09:00", actualPickupDate: null };

  it("at the shop: when, the address with opening hours, the pickup instructions; the return is planned below, no buttons", () => {
    render(<HandoverBlock {...props} reservation={booked} />);
    expect(step("pickup")).toHaveAttribute("data-active", "true");
    expect(within(step("pickup")).getByTestId("handover-countdown")).toHaveTextContent("Over 3 dagen");
    expect(screen.getByTestId("handover-when-pickup")).toHaveTextContent("15-10-2026 · om 09:00");
    expect(screen.getByTestId("handover-what-pickup")).toHaveTextContent("U haalt de auto op bij ons");
    expect(screen.getByTestId("handover-shop-pickup")).toHaveTextContent("08:00 - 17:00");
    expect(screen.getByText(/geldig rijbewijs/)).toBeInTheDocument();
    expect(step("return")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("handover-what-return")).toHaveTextContent("U levert de auto in bij ons");
    expect(screen.queryByTestId("button-handover-extend")).toBeNull();
  });

  it("delivered and collected: we bring it, and we will collect it, at their own places", () => {
    render(<HandoverBlock {...props} reservation={{ ...booked, handover: away("Dorpsstraat 1, 1234 AB Utrecht", "Havenweg 9, Rotterdam") }} />);
    expect(screen.getByTestId("handover-what-pickup")).toHaveTextContent("Wij brengen de auto naar Dorpsstraat 1, 1234 AB Utrecht");
    expect(screen.getByTestId("handover-what-return")).toHaveTextContent("Wij halen de auto bij u op Havenweg 9, Rotterdam");
    expect(screen.queryByText(/Kerkweg 47a/)).toBeNull();
  });

  it("says a place will be agreed when the office has not filled it in yet", () => {
    render(<HandoverBlock {...props} reservation={{ ...booked, handover: away(null, null) as any }} />);
    const unset = { pickup: { method: "delivery", location: null }, return: { method: "collection", location: null } } as any;
    render(<HandoverBlock {...props} reservation={{ ...booked, handover: unset }} />);
    expect(screen.getAllByText(/een locatie die we met u afspreken/).length).toBe(2);
  });
});

describe("the rental is over", () => {
  it("shows both steps in the past tense, with where the car was brought and collected, and no countdown, notes or buttons", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, status: "completed", actualReturnDate: "2026-10-19", handover: away("Dorpsstraat 1, Utrecht", "Havenweg 9, Rotterdam") }} />);
    expect(screen.getByTestId("handover-what-pickup")).toHaveTextContent("Gebracht naar Dorpsstraat 1, Utrecht");
    expect(screen.getByTestId("handover-what-return")).toHaveTextContent("Opgehaald bij Havenweg 9, Rotterdam");
    expect(screen.getByTestId("handover-when-return")).toHaveTextContent("op 19-10-2026");
    expect(screen.getByTestId("handover-block")).toHaveAttribute("data-state", "done");
    expect(screen.queryByTestId("handover-countdown")).toBeNull();
    expect(screen.queryByTestId("handover-return-instructions")).toBeNull();
    expect(screen.queryByTestId("handover-delivery-note")).toBeNull();
    expect(screen.queryByTestId("button-handover-extend")).toBeNull();
  });

  it("a rental that was collected and returned at the shop says so, with the shop's address but no opening hours", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, status: "returned", actualReturnDate: "2026-10-19" }} />);
    expect(screen.getByTestId("handover-what-pickup")).toHaveTextContent("Opgehaald bij ons");
    expect(screen.getByTestId("handover-what-return")).toHaveTextContent("Ingeleverd bij ons");
    expect(screen.getByTestId("handover-shop-return")).toHaveTextContent("Kerkweg 47a");
    expect(screen.getByTestId("handover-shop-return")).not.toHaveTextContent("08:00 - 17:00");
  });

  it("shows nothing for a cancelled reservation", () => {
    const { container } = render(<HandoverBlock {...props} reservation={{ ...base, status: "cancelled" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
