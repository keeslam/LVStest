/**
 * Setup for the jsdom project (plan §8.8). Deliberately does NOT load
 * `dotenv` and does NOT look at `DATABASE_URL`: a component test must never
 * be able to reach the database.
 *
 * jsdom implements enough of a browser for React, but not the three things
 * Radix UI reaches for on every dialog/select: pointer capture, ResizeObserver
 * and matchMedia. Without these a component test fails inside the library
 * instead of on the assertion, which is worse than no test at all.
 */
import "@testing-library/jest-dom/vitest";
// The real i18n instance, with the real `client/src/locales/nl/*.json`. A
// component test that asserts on Dutch text then fails when a key is missing
// or when a string was never translated (BUG-223), instead of silently
// rendering the key.
import "@/i18n";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!(globalThis as any).IntersectionObserver) {
  (globalThis as any).IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

// Radix' DismissableLayer / Select call these on every pointer interaction.
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

// A component test that renders an error on purpose should not bury the real
// output of the run in React's expected-error noise; individual tests silence
// what they provoke themselves.
export const silenceConsoleError = () =>
  vi.spyOn(console, "error").mockImplementation(() => {});
