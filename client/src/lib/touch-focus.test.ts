// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusUnlessTouch, isTouchOnly, touchSafeOpenAutoFocus } from "./touch-focus";

function setTouch(touch: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: touch }) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("touch-focus", () => {
  it("detects a touch-only screen through the media query", () => {
    setTouch(true);
    expect(isTouchOnly()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(hover: none) and (pointer: coarse)");
    setTouch(false);
    expect(isTouchOnly()).toBe(false);
  });

  it("focuses a field on desktop but not on an iPad", () => {
    const input = document.body.appendChild(document.createElement("input"));
    setTouch(true);
    focusUnlessTouch(input);
    expect(document.activeElement).not.toBe(input);
    setTouch(false);
    focusUnlessTouch(input);
    expect(document.activeElement).toBe(input);
  });

  it("on an iPad keeps Radix off the first input and focuses the container", () => {
    const box = document.body.appendChild(document.createElement("div"));
    box.tabIndex = -1;
    setTouch(true);
    const event = new Event("focusScope.autoFocusOnMount", { cancelable: true });
    touchSafeOpenAutoFocus(undefined, () => box)(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(box);
  });

  it("leaves desktop and a caller's own handler alone", () => {
    setTouch(false);
    const desktop = new Event("x", { cancelable: true });
    touchSafeOpenAutoFocus(undefined, () => null)(desktop);
    expect(desktop.defaultPrevented).toBe(false);

    setTouch(true);
    const own = vi.fn((e: Event) => e.preventDefault());
    const container = vi.fn(() => null);
    touchSafeOpenAutoFocus(own, container)(new Event("x", { cancelable: true }));
    expect(own).toHaveBeenCalled();
    expect(container).not.toHaveBeenCalled();
  });
});
