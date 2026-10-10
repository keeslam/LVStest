/**
 * A PDF viewer inside an iframe keeps the keyboard focus, so Escape never reaches the dialog around it
 * (audit 2026-10-09, A-10-3 / A-10-4). The helper hands the focus back, once, only if the iframe has it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { releaseIframeFocus } from "./release-iframe-focus";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<div role="dialog" tabindex="-1" id="dlg"><button id="btn">x</button><iframe id="frame"></iframe></div>`;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("releaseIframeFocus", () => {
  it("returns the focus to the dialog when the iframe has taken it", () => {
    const frame = document.getElementById("frame") as HTMLIFrameElement;
    frame.focus();
    expect(document.activeElement).toBe(frame);
    releaseIframeFocus(frame, 250);
    vi.advanceTimersByTime(300);
    expect(document.activeElement).toBe(document.getElementById("dlg"));
  });

  it("leaves the focus alone when somebody else has it (the person moved on)", () => {
    const frame = document.getElementById("frame") as HTMLIFrameElement;
    const button = document.getElementById("btn") as HTMLButtonElement;
    frame.focus();
    releaseIframeFocus(frame, 250);
    button.focus();
    vi.advanceTimersByTime(300);
    expect(document.activeElement).toBe(button);
  });

  it("does nothing without a frame or without a dialog around it", () => {
    expect(() => releaseIframeFocus(null)).not.toThrow();
    document.body.innerHTML = `<iframe id="lone"></iframe>`;
    const lone = document.getElementById("lone") as HTMLIFrameElement;
    lone.focus();
    releaseIframeFocus(lone, 10);
    expect(() => vi.advanceTimersByTime(20)).not.toThrow();
  });
});
