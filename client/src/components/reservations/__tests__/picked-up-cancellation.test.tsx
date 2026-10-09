/**
 * Sub-project C, Task 5 (besluiten B-33, B-39; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §3):
 * cancelling or deleting a rental that has been picked up.
 *
 * The pieces every delete confirmation shares:
 *  - `PickedUpWarning`: the box "Deze huur is al opgehaald op <datum> met
 *    contract <nr>." with `checkbox-confirm-picked-up`;
 *  - `ConfirmDeleteReservationDialog`: the confirmation itself - for a picked-up
 *    row the confirm button stays disabled until the box is ticked, and the flag
 *    `confirmPickedUp` is handed on only then;
 *  - `cancelRightFor`: the permission an opener needs (picked up: the new right,
 *    otherwise `manage_reservations` as before);
 *  - `pickedUpRefusalOf`: the client branches on the stable `code` of a 409, never
 *    on the English message.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { UserPermission } from "@shared/schema";
import { PICKED_UP_CODES } from "@shared/picked-up-cancellation";
import nlReservations from "@/locales/nl/reservations.json";
import enReservations from "@/locales/en/reservations.json";
import nlCustomers from "@/locales/nl/customers.json";
import enCustomers from "@/locales/en/customers.json";
import nlVehicles from "@/locales/nl/vehicles.json";
import enVehicles from "@/locales/en/vehicles.json";
import {
  PickedUpWarning, cancelRightFor, pickedUpRefusalOf, isPickedUpRightRefusal,
} from "@/components/reservations/picked-up-cancellation";
import { ConfirmDeleteReservationDialog } from "@/components/reservations/delete-reservation-confirm";

const pickedUp = {
  id: 901, status: "picked_up", type: "standard", actualPickupDate: "2026-10-02", contractNumber: "9300001",
};
const booked = { ...pickedUp, id: 902, status: "booked", actualPickupDate: null, contractNumber: null };

function Warning({ date = "2026-10-02", contract = "9300001" as string | null }) {
  const [checked, setChecked] = useState(false);
  return <PickedUpWarning actualPickupDate={date} contractNumber={contract} checked={checked} onCheckedChange={setChecked} />;
}

describe("PickedUpWarning", () => {
  it("names the pickup date and the contract number and carries the checkbox", () => {
    render(<Warning />);
    const box = screen.getByTestId("warning-picked-up");
    expect(box).toHaveTextContent("Deze huur is al opgehaald op 02-10-2026 met contract 9300001.");
    // Spec §3: the dialog says the car counts as available and the odometer keeps the pickup reading.
    expect(box).toHaveTextContent("beschikbaar");
    expect(box).toHaveTextContent("kilometerstand blijft de stand van het ophalen");
    expect(screen.getByTestId("checkbox-confirm-picked-up")).toHaveAttribute("aria-checked", "false");
  });

  it("ticks and unticks", async () => {
    render(<Warning />);
    const box = screen.getByTestId("checkbox-confirm-picked-up");
    await userEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    await userEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("shows a dash instead of an empty date or contract", () => {
    render(<Warning date="" contract={null} />);
    expect(screen.getByTestId("warning-picked-up")).toHaveTextContent("Deze huur is al opgehaald op — met contract —.");
  });
});

describe("cancelRightFor", () => {
  it("asks for cancel_picked_up_rental on a picked-up row (legacy spellings included) and for manage_reservations otherwise", () => {
    expect(cancelRightFor(pickedUp)).toEqual([UserPermission.CANCEL_PICKED_UP_RENTAL]);
    expect(cancelRightFor({ status: "active", type: "standard" })).toEqual([UserPermission.CANCEL_PICKED_UP_RENTAL]);
    expect(cancelRightFor(booked)).toEqual([UserPermission.MANAGE_RESERVATIONS]);
    expect(cancelRightFor({ status: "completed", type: "standard" })).toEqual([UserPermission.MANAGE_RESERVATIONS]);
    expect(cancelRightFor(null)).toEqual([UserPermission.MANAGE_RESERVATIONS]);
  });

  it("keeps a maintenance block on manage_reservations even with the legacy status 'active'", () => {
    expect(cancelRightFor({ status: "active", type: "maintenance_block" })).toEqual([UserPermission.MANAGE_RESERVATIONS]);
  });
});

describe("pickedUpRefusalOf / isPickedUpRightRefusal", () => {
  it("recognises the 409 by its code and hands back what the server said", () => {
    const error = Object.assign(new Error("409: This rental has already been picked up."), {
      code: PICKED_UP_CODES.CONFIRMATION_REQUIRED, actualPickupDate: "2026-10-02", contractNumber: "9300001", httpStatus: 409,
    });
    expect(pickedUpRefusalOf(error)).toEqual({ actualPickupDate: "2026-10-02", contractNumber: "9300001" });
  });

  it("branches on the code only: the same English words under another code do not count", () => {
    const lookalike = Object.assign(new Error("409: This rental has already been picked up."), { code: "SOMETHING_ELSE" });
    expect(pickedUpRefusalOf(lookalike)).toBeNull();
    expect(pickedUpRefusalOf(new Error("409: PICKED_UP_CONFIRMATION_REQUIRED"))).toBeNull();
    expect(pickedUpRefusalOf(null)).toBeNull();
    expect(pickedUpRefusalOf("boom")).toBeNull();
  });

  it("recognises the 403 by its code", () => {
    expect(isPickedUpRightRefusal(Object.assign(new Error("403: x"), { code: PICKED_UP_CODES.RIGHT_REQUIRED }))).toBe(true);
    expect(isPickedUpRightRefusal(Object.assign(new Error("403: Not authorized. cancel_picked_up_rental"), { code: "NOPE" }))).toBe(false);
  });
});

describe("ConfirmDeleteReservationDialog", () => {
  function renderDialog(reservation: typeof pickedUp | typeof booked | null, onConfirm = vi.fn()) {
    render(
      <ConfirmDeleteReservationDialog
        open
        onOpenChange={() => {}}
        reservation={reservation}
        title="Reservering verwijderen"
        description="De reservering gaat naar de prullenbak."
        confirmLabel="Verwijderen"
        onConfirm={onConfirm}
      />,
    );
    return onConfirm;
  }

  it("a booked row has no warning and confirms at once, without the flag", async () => {
    const onConfirm = renderDialog(booked);
    expect(screen.queryByTestId("warning-picked-up")).toBeNull();
    const confirm = screen.getByTestId("confirm-dialog-confirm");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ confirmPickedUp: false });
  });

  it("a picked-up row shows the warning with date and contract, and the confirm button waits for the tick", async () => {
    const onConfirm = renderDialog(pickedUp);
    expect(screen.getByTestId("warning-picked-up")).toHaveTextContent("opgehaald op 02-10-2026 met contract 9300001");
    const confirm = screen.getByTestId("confirm-dialog-confirm");
    expect(confirm).toBeDisabled();

    await userEvent.click(screen.getByTestId("checkbox-confirm-picked-up"));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ confirmPickedUp: true });
  });

  it("unticking disables the confirm button again", async () => {
    renderDialog(pickedUp);
    const confirm = screen.getByTestId("confirm-dialog-confirm");
    await userEvent.click(screen.getByTestId("checkbox-confirm-picked-up"));
    expect(confirm).toBeEnabled();
    await userEvent.click(screen.getByTestId("checkbox-confirm-picked-up"));
    expect(confirm).toBeDisabled();
  });

  it("a legacy 'active' row counts as picked up", () => {
    renderDialog({ ...pickedUp, status: "active" });
    expect(screen.getByTestId("warning-picked-up")).toBeInTheDocument();
  });

  it("a maintenance block with the legacy status 'active' is not asked anything", () => {
    renderDialog({ ...pickedUp, type: "maintenance_block", status: "active" });
    expect(screen.queryByTestId("warning-picked-up")).toBeNull();
    expect(screen.getByTestId("confirm-dialog-confirm")).toBeEnabled();
  });

  it("no row at all (state not set yet) behaves as an ordinary confirmation", () => {
    renderDialog(null);
    expect(screen.queryByTestId("warning-picked-up")).toBeNull();
  });
});

describe("the confirmation texts speak of the recycle bin (nl + en)", () => {
  const stale = /permanent|permanently|ongedaan|cannot be undone|can't be undone/i;
  const texts: Array<[string, string]> = [
    ["nl reservations viewDialog.deleteConfirm", nlReservations.viewDialog.deleteConfirm.description],
    ["nl reservations listDialog.deleteDialog", nlReservations.listDialog.deleteDialog.description],
    ["nl reservations completedRentals.deleteDescription", nlReservations.calendarPage.completedRentals.deleteDescription],
    ["nl reservations completedRentals toast", nlReservations.calendarPage.completedRentals.toasts.deletedDescription],
    ["nl reservations deleteReservationForCustomer", nlReservations.calendarPage.deleteReservationForCustomerDescription],
    ["nl customers deleteReservationConfirm", nlCustomers.details.deleteReservationConfirm],
    ["nl vehicles confirmDeleteDescription", nlVehicles.details.reservations.confirmDeleteDescription],
    ["en reservations viewDialog.deleteConfirm", enReservations.viewDialog.deleteConfirm.description],
    ["en reservations listDialog.deleteDialog", enReservations.listDialog.deleteDialog.description],
    ["en reservations completedRentals.deleteDescription", enReservations.calendarPage.completedRentals.deleteDescription],
    ["en reservations completedRentals toast", enReservations.calendarPage.completedRentals.toasts.deletedDescription],
    ["en reservations deleteReservationForCustomer", enReservations.calendarPage.deleteReservationForCustomerDescription],
    ["en customers deleteReservationConfirm", enCustomers.details.deleteReservationConfirm],
    ["en vehicles confirmDeleteDescription", enVehicles.details.reservations.confirmDeleteDescription],
  ];

  it.each(texts)("%s no longer says permanent or cannot be undone", (_name, text) => {
    expect(text).not.toMatch(stale);
  });

  it.each(texts.filter(([name]) => !name.includes("toast")))("%s names the recycle bin", (name, text) => {
    expect(text).toMatch(name.startsWith("nl") ? /prullenbak/i : /recycle bin/i);
  });

  it("the Dutch confirmations use the wording the owner asked for", () => {
    expect(nlReservations.viewDialog.deleteConfirm.description).toContain("wordt naar de prullenbak verplaatst; terugzetten kan via Prullenbak");
  });

  it("both languages carry the same keys for the new warning", () => {
    expect(Object.keys(enReservations.pickedUpWarning).sort()).toEqual(Object.keys(nlReservations.pickedUpWarning).sort());
  });
});
