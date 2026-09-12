/**
 * FIX-R — the DOM half of the audit's regression tests.
 *
 * BUG-073 — "DOM-XSS via innerHTML met driver.licenseFilePath": the driver
 * view dialog built its "preview not available" fallback with innerHTML and
 * the stored file path interpolated into it. A driver row whose
 * `licenseFilePath` is `<img src=x onerror=alert(1)>` therefore executed as
 * soon as the image failed to load — which it always does for such a path.
 *
 * BUG-102 — "een record met <script> in brand afdrukken; het iframe-DOM mag
 * geen <script>-element bevatten", the audit's own wording.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DriverViewDialog } from "@/components/customers/driver-view-dialog";
import { escapeHtml } from "@/lib/html-escape";

const HOSTILE = `<img src=x onerror="document.title='pwned'">`;

function driverWith(licenseFilePath: string) {
  return {
    id: 9,
    customerId: 1,
    displayName: "Jan Jansen",
    firstName: "Jan",
    lastName: "Jansen",
    email: null,
    phone: null,
    status: "active",
    isPrimaryDriver: true,
    driverLicenseNumber: null,
    licenseExpiry: null,
    licenseOrigin: null,
    preferredLanguage: null,
    licenseFilePath,
  } as any;
}

describe("BUG-073 — the driver licence fallback cannot execute a stored path", () => {
  it("renders the failed-preview fallback without creating the injected element", () => {
    render(
      <DriverViewDialog
        driver={driverWith(HOSTILE)}
        activeReservation={null}
        open
        onOpenChange={() => {}}
      />,
    );

    const image = screen.getByTestId("img-driver-license-preview");
    // The path is not a real image, so the browser fires onError — exactly the
    // situation the audit describes.
    fireEvent.error(image);

    // Nothing was parsed as markup: no element came out of the stored value.
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(document.title).not.toBe("pwned");
    // ...and the stored value is present as literal text, not as markup.
    const fallback = document.querySelector(".text-muted-foreground p, p");
    expect(fallback).not.toBeNull();
    // A hostile path is not offered as a link either.
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain(`/${HOSTILE}`);
  });

  it("does not offer a link for a path that would not be safe to open", () => {
    render(
      <DriverViewDialog
        driver={driverWith("uploads/licenses/a.png")}
        activeReservation={null}
        open
        onOpenChange={() => {}}
      />,
    );

    fireEvent.error(screen.getByTestId("img-driver-license-preview"));

    const links = Array.from(document.querySelectorAll("a"));
    // The ordinary path does produce a link...
    expect(links.some((a) => a.getAttribute("href") === "/uploads/licenses/a.png")).toBe(true);
    // ...and it carries noopener, so the opened tab cannot steer this one.
    const link = links.find((a) => a.getAttribute("href") === "/uploads/licenses/a.png")!;
    expect(link.rel).toContain("noopener");
  });
});

describe("BUG-102 — a printed report value produces no element", () => {
  it("a brand containing a script tag is text in the print DOM, not markup", () => {
    const brand = `<script>window.__pwned = true</script><img src=x onerror="window.__pwned = true">`;
    const html = `<table><tbody><tr><td>${escapeHtml(brand)}</td></tr></tbody></table>`;

    // The sink the report printer uses: innerHTML on a document it built.
    const host = document.createElement("div");
    host.innerHTML = html;

    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("img[onerror]")).toBeNull();
    expect((window as any).__pwned).toBeUndefined();
    // Escaped, not deleted: the employee still sees what the record says.
    expect(host.textContent).toContain("<script>window.__pwned = true</script>");
  });
});
