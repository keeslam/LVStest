/**
 * A-18-5 (audit 2026-10-09): the reason a control is switched off appeared on
 * hover and keyboard focus only; a tablet has neither. A tap on the wrapper
 * opens it too, and while it is open the wrapper is described by the text.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserPermission } from "@shared/schema";
import { Button } from "@/components/ui/button";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "user", permissions: [] }, isLoading: false }),
}));

import { RequiresPermission } from "@/components/ui/requires-permission";

function renderDenied(onClick = vi.fn()) {
  render(
    <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
      <Button data-testid="button-add-vehicle" onClick={onClick}>Voertuig toevoegen</Button>
    </RequiresPermission>,
  );
  const button = screen.getByTestId("button-add-vehicle");
  return { button, wrapper: button.parentElement as HTMLElement, onClick };
}

describe("RequiresPermission - tap to see why", () => {
  it("opens the reason on a plain click on the wrapper, without hover or focus", async () => {
    const { wrapper, onClick } = renderDenied();
    expect(wrapper).toHaveAttribute("data-state", "closed");
    fireEvent.click(wrapper);
    await waitFor(() => expect(wrapper).toHaveAttribute("data-state", expect.stringMatching(/open/)));
    expect((await screen.findAllByText(/Hiervoor heeft u het recht/i)).length).toBeGreaterThan(0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("points the wrapper's aria-describedby at the reason while it is open", async () => {
    const { wrapper } = renderDenied();
    expect(wrapper).not.toHaveAttribute("aria-describedby");
    fireEvent.click(wrapper);
    await waitFor(() => expect(wrapper).toHaveAttribute("aria-describedby"));
    const id = wrapper.getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent ?? "").toMatch(/recht/i);
  });

  it("still opens on keyboard focus, and keeps the control disabled", async () => {
    const { button, wrapper } = renderDenied();
    wrapper.focus();
    await waitFor(() => expect(wrapper).toHaveAttribute("data-state", expect.stringMatching(/open/)));
    expect(button).toHaveAttribute("aria-disabled", "true");
  });
});
