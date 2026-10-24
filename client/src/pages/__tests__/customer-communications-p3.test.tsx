/**
 * Audit remediation P3 (Communicatie), module 13 of docs/audit/fysieke-e2e-audit-2026-10-09.md:
 *
 *  A-13-2  a send that mailed nobody no longer says "succesvol verstuurd"
 *  A-13-3  the preview is rendered per recipient, with the recipient's own data
 *  A-13-4  the saved-template list follows save, update and delete
 *  A-13-5  the pickers offer templates of their own category, never the portal's
 *  A-13-7  Edit and Duplicate bring the form into view; Dutch copy name and text
 *  A-13-8  no "Car Rental System" / "customer@example.com" / "John Doe" sample text
 *  A-13-9  singular and plural, and a counter that says what it counts
 *  A-13-10 a disabled send button says why
 *  A-13-12 a mass send needs a second, explicit confirmation
 *  A-13-13 a row of the log opens a detail view; kinds and reasons in Dutch
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [] }, isLoading: false }),
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
  toast: toastSpy,
}));

vi.mock("@/contexts/GlobalDialogContext", () => ({ useGlobalDialog: () => ({ openVehicleDialog: vi.fn() }) }));

import CustomerCommunications from "@/pages/CustomerCommunications";
import { fakeEmailLogResponse } from "@/__tests__/fake-email-log-api";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const CUSTOMER_A = { id: 1, name: "Audit Testklant B.v.", email: "audit@e2e.invalid", emailForMOT: "apk@e2e.invalid", emailGeneral: null, emailForInvoices: null, hasActiveReservation: true, phone: "06-11111111" };
const CUSTOMER_B = { id: 2, name: "Tweede Klant", email: "tweede@e2e.invalid", emailForMOT: null, emailGeneral: null, emailForInvoices: null, hasActiveReservation: false };
const VEHICLE_1 = { id: 10, licensePlate: "97GRD4", brand: "Toyota", model: "Yaris", apkDate: "2026-12-31", vehicleType: "Personenauto" };

let templates: any[];
let logRows: any[];
let sendResponse: () => Response;
let sendBody: any;
let fetchMock: ReturnType<typeof vi.fn>;
let nextTemplateId: number;

function urlOf(input: unknown): string {
  return typeof input === "string" ? input : (input as Request)?.url ?? "";
}

function callsTo(url: string, method?: string) {
  return fetchMock.mock.calls.filter(([input, init]) => urlOf(input).includes(url) && (!method || (init?.method ?? "GET") === method));
}

beforeEach(() => {
  toastSpy.mockClear();
  nextTemplateId = 100;
  templates = [
    { id: 1, name: "APK herinnering", subject: "APK voor {vehiclePlate}", content: "Beste {customerName}, de APK van {vehiclePlate} ({vehicleBrand}) verloopt op {apkDate}.", category: "apk", createdAt: "2026-10-01T10:00:00.000Z" },
    { id: 2, name: "portal_invite", subject: "Uw account", content: "<p>Beste {{name}},</p>", category: "portal", createdAt: "2026-10-01T10:00:00.000Z" },
    { id: 3, name: "Onderhoud herinnering", subject: "Onderhoud {vehiclePlate}", content: "Onderhoud nodig.", category: "maintenance", createdAt: "2026-10-01T10:00:00.000Z" },
    { id: 4, name: "Algemeen bericht", subject: "Nieuws", content: "Hallo {{customerName}}", category: "custom", createdAt: "2026-10-01T10:00:00.000Z" },
  ];
  logRows = [];
  sendBody = null;
  sendResponse = () => json({ success: true, sent: 1, failed: 0 });
  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = urlOf(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/notifications/send")) {
      sendBody = JSON.parse(String(init?.body ?? "{}"));
      return sendResponse();
    }
    if (url.includes("/api/email-templates")) {
      if (method === "POST") {
        const body = JSON.parse(String(init?.body));
        const created = { id: nextTemplateId++, createdAt: "2026-10-10T10:00:00.000Z", ...body };
        templates = [...templates, created];
        return json(created, 201);
      }
      const id = Number(url.split("/api/email-templates/")[1]);
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body));
        templates = templates.map((tpl) => (tpl.id === id ? { ...tpl, ...body } : tpl));
        return json(templates.find((tpl) => tpl.id === id));
      }
      if (method === "DELETE") {
        templates = templates.filter((tpl) => tpl.id !== id);
        return json({ message: "Template deleted successfully" });
      }
      return json(templates);
    }
    const logResponse = fakeEmailLogResponse(url, logRows);
    if (logResponse) return logResponse;
    if (url.includes("/api/vehicles/")) return json([{ vehicle: VEHICLE_1, customer: CUSTOMER_A, reservation: { startDate: "2026-10-01", endDate: "2026-10-09" } }]);
    if (url.includes("/api/app-settings/key/company_name")) return json({ key: "company_name", value: "Garage Voorbeeld" });
    if (url.includes("/api/customers/with-reservations")) return json([CUSTOMER_A, CUSTOMER_B]);
    if (url.includes("/api/customers")) return json([CUSTOMER_A, CUSTOMER_B]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no layout, so no scrollIntoView (the shared setup stubs it on HTMLElement).
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>
    <CustomerCommunications />
  </QueryClientProvider>);
}

async function openPicker(user: ReturnType<typeof userEvent.setup>, testId: string) {
  await user.click(await screen.findByTestId(testId));
  return screen.findAllByRole("option");
}

describe("A-13-5 - the template pickers", () => {
  it("APK: the apk and the free templates, no portal template under its raw key", async () => {
    const user = userEvent.setup();
    renderPage();
    const options = await openPicker(user, "select-apk-template");
    expect(options.map((o) => o.textContent)).toEqual(["APK herinnering", "Algemeen bericht"]);
    expect(screen.queryByText("portal_invite")).not.toBeInTheDocument();
  });

  it("Onderhoud: the maintenance and the free templates", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-maintenance"));
    const options = await openPicker(user, "select-maintenance-template");
    expect(options.map((o) => o.textContent)).toEqual(["Onderhoud herinnering", "Algemeen bericht"]);
  });

  it("Aangepast: every template except the system ones, after the 'no template' choice", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-custom"));
    const options = await openPicker(user, "select-custom-template");
    expect(options.map((o) => o.textContent)).toEqual([
      "Geen sjabloon - gebruik aangepast bericht", "APK herinnering", "Onderhoud herinnering", "Algemeen bericht",
    ]);
  });
});

describe("A-13-4 - the saved-template list follows what was done", () => {
  async function openBuilder(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("tab", { name: "Sjabloonbouwer" }));
    await screen.findByTestId("template-card-1");
  }

  it("a saved template shows up in the list without a reload", async () => {
    const user = userEvent.setup();
    renderPage();
    await openBuilder(user);
    expect(screen.getByText("Opgeslagen sjablonen (4)")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Sjabloonnaam"), "Mijn eigen sjabloon");
    await user.type(screen.getByLabelText("E-mailonderwerp"), "Onderwerp");
    await user.type(screen.getByLabelText("E-mailinhoud"), "Inhoud");
    await user.click(screen.getByTestId("button-save-template"));

    expect(await screen.findByText("Opgeslagen sjablonen (5)")).toBeInTheDocument();
    expect(await screen.findByText("Mijn eigen sjabloon")).toBeInTheDocument();
  });

  it("an updated template shows its new name, and a deleted one is gone", async () => {
    const user = userEvent.setup();
    renderPage();
    await openBuilder(user);

    await user.click(screen.getByTestId("button-edit-4"));
    const name = screen.getByLabelText("Sjabloonnaam");
    await user.clear(name);
    await user.type(name, "Algemeen bericht (nieuw)");
    await user.click(screen.getByTestId("button-save-template"));
    expect(await screen.findByText("Algemeen bericht (nieuw)")).toBeInTheDocument();
    expect(screen.queryByText("Algemeen bericht")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("button-delete-4"));
    await user.click(await screen.findByTestId("button-confirm-delete-template"));
    await waitFor(() => expect(screen.queryByTestId("template-card-4")).not.toBeInTheDocument());
    expect(screen.getByText("Opgeslagen sjablonen (3)")).toBeInTheDocument();
  });
});

describe("A-13-7 / A-13-8 - Edit and Duplicate, and the sample text", () => {
  it("Edit and Duplicate bring the form into view and focus the name; the copy is called (kopie), the toast says Sjablooninhoud", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Sjabloonbouwer" }));
    await screen.findByTestId("template-card-1");

    (HTMLElement.prototype.scrollIntoView as any).mockClear();
    await user.click(screen.getByTestId("button-edit-1"));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Sjabloonnaam")).toHaveValue("APK herinnering");
    await waitFor(() => expect(screen.getByLabelText("Sjabloonnaam")).toHaveFocus());

    await user.click(screen.getByTestId("button-duplicate-1"));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Sjabloonnaam")).toHaveValue("APK herinnering (kopie)");
    const toast = toastSpy.mock.calls.at(-1)![0];
    expect(toast.description).toContain("Sjablooninhoud");
    expect(toast.description).not.toContain("Sjabloonhoud");
  });

  it("the live preview and the saved-template preview use neutral Dutch sample text", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Sjabloonbouwer" }));
    await user.click(await screen.findByRole("button", { name: /Live voorvertoning tonen/ }));
    await pasteInto(user, screen.getByLabelText("E-mailonderwerp"), "Hallo {customerName}");
    const page = document.body.textContent ?? "";
    expect(page).not.toContain("Car Rental");
    expect(page).not.toContain("John Doe");
    expect(page).not.toContain("Toyota Camry");
    expect(page).not.toContain("example.com");

    await user.click(screen.getByTestId("button-preview-1"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).not.toContain("Car Rental");
    expect(dialog.textContent).not.toContain("customer@example.com");
  });

  it("the portal system templates are listed under a Dutch name, not their raw key", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Sjabloonbouwer" }));
    const card = await screen.findByTestId("template-card-2");
    expect(within(card).queryByText("portal_invite")).not.toBeInTheDocument();
    expect(within(card).getByText("Portaal: uitnodiging")).toBeInTheDocument();
    expect(within(card).getByText("PORTAAL")).toBeInTheDocument();
  });

  it("a portal template in another language carries that language's name, and the language filter narrows the portal rows only", async () => {
    templates.push({ id: 5, name: "portal_invite.es", subject: "Su cuenta", content: "<p>Estimado/a {{name}}:</p>", category: "portal", createdAt: "2026-10-01T10:00:00.000Z" });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Sjabloonbouwer" }));
    expect(within(await screen.findByTestId("template-card-5")).getByText("Portaal: uitnodiging (Español)")).toBeInTheDocument();

    await user.click(screen.getByTestId("select-template-language"));
    await user.click(await screen.findByRole("option", { name: "Español" }));
    await waitFor(() => expect(screen.queryByTestId("template-card-2")).not.toBeInTheDocument());
    expect(screen.getByTestId("template-card-5")).toBeInTheDocument();
    // A template staff wrote themselves has no language and stays in the list.
    expect(screen.getByTestId("template-card-1")).toBeInTheDocument();
  });
});

describe("A-13-9 / A-13-10 - counts, plural and the reason a button is off", () => {
  it("the button says why it is off, then names one vehicle in the singular", async () => {
    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByTestId("button-preview-apk");
    expect(button).toBeDisabled();
    expect(screen.getByTestId("hint-preview-apk")).toHaveTextContent("Kies een sjabloon en minstens één voertuig");

    await user.click(await screen.findByTestId("vehicle-card-10"));
    expect(screen.getByTestId("hint-preview-apk")).toHaveTextContent("Kies een sjabloon");
    await user.click(await screen.findByTestId("select-apk-template"));
    await user.click(await screen.findByRole("option", { name: "APK herinnering" }));

    expect(button).toBeEnabled();
    expect(screen.queryByTestId("hint-preview-apk")).not.toBeInTheDocument();
    expect(button).toHaveTextContent("Voorvertonen & versturen naar 1 voertuig");
    expect(button).not.toHaveTextContent("voertuigen");
  });

  it("the header names what the vehicle count counts, per tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("stats-line")).toHaveTextContent("2 klanten • 1 voertuig met APK binnen 2 maanden"));
    await user.click(screen.getByTestId("tab-maintenance"));
    await waitFor(() => expect(screen.getByTestId("stats-line")).toHaveTextContent("2 klanten • 1 voertuig dat onderhoud nodig heeft"));
    await user.click(screen.getByTestId("tab-custom"));
    await waitFor(() => expect(screen.getByTestId("stats-line")).toHaveTextContent("2 klanten • 1 voertuig met een lopende reservering"));
  });

  it("the custom tab names the singular and the plural of what is ticked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-custom"));
    expect(screen.getByTestId("hint-preview-custom")).toHaveTextContent("Kies minstens één ontvanger");
    await user.click(await screen.findByTestId("customer-card-1"));
    await user.click(await screen.findByTestId("vehicle-card-custom-10"));
    expect(screen.getByText("1 klant + 1 voertuig geselecteerd")).toBeInTheDocument();
    await user.click(screen.getByTestId("customer-card-2"));
    expect(screen.getByText("2 klanten + 1 voertuig geselecteerd")).toBeInTheDocument();
  });
});

async function pasteInto(user: ReturnType<typeof userEvent.setup>, element: HTMLElement, text: string) {
  await user.click(element);
  await user.paste(text);
}

async function customMessageToCustomers(user: ReturnType<typeof userEvent.setup>, ...customerTestIds: string[]) {
  await user.click(await screen.findByTestId("tab-custom"));
  for (const id of customerTestIds) await user.click(await screen.findByTestId(id));
  await pasteInto(user, screen.getByTestId("input-custom-subject"), "Nieuws voor {customerName}");
  await pasteInto(user, screen.getByTestId("textarea-custom-message"), "Beste {customerName}, uw {vehiclePlate} ({{vehicleBrand}}).");
  await user.click(screen.getByTestId("button-preview-custom"));
}

describe("A-13-3 - the preview is the mail each recipient gets", () => {
  it("fills in the data of the chosen recipient, with a vehicle's renter when a vehicle is ticked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-custom"));
    await user.click(await screen.findByTestId("customer-card-2"));
    await user.click(await screen.findByTestId("vehicle-card-custom-10"));
    await pasteInto(user, screen.getByTestId("input-custom-subject"), "Nieuws voor {customerName}");
    await pasteInto(user, screen.getByTestId("textarea-custom-message"), "Beste {customerName}, uw {vehiclePlate} ({{vehicleBrand}}).");
    await user.click(screen.getByTestId("button-preview-custom"));

    const dialog = await screen.findByRole("dialog");
    // Two recipients: the renter of the ticked vehicle and the ticked customer, each once.
    expect(within(dialog).getByTestId("preview-recipient-v10")).toHaveTextContent("Audit Testklant B.v.");
    expect(within(dialog).getByTestId("preview-recipient-v10")).toHaveTextContent("97-GRD-4");
    expect(within(dialog).getByTestId("preview-recipient-c2")).toHaveTextContent("Tweede Klant");
    expect(within(dialog).queryByText("N/A")).not.toBeInTheDocument();

    // The first recipient's mail: their name, their plate, double braces filled too.
    expect(within(dialog).getByTestId("preview-subject")).toHaveTextContent("Nieuws voor Audit Testklant B.v.");
    expect(within(dialog).getByTestId("preview-content")).toHaveTextContent("Beste Audit Testklant B.v., uw 97-GRD-4 (Toyota).");
    expect(dialog.textContent).not.toContain("[Kenteken]");
    expect(dialog.textContent).not.toContain("{{");

    // The other recipient has no vehicle: the plate comes out empty, and the preview says so.
    await user.click(within(dialog).getByTestId("preview-recipient-c2"));
    expect(within(dialog).getByTestId("preview-content")).toHaveTextContent("Beste Tweede Klant, uw ().");
    expect(within(dialog).getByTestId("preview-empty-note")).toHaveTextContent("Kenteken");
  });

  it("a saved template is shown as the mail will read, per recipient", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("vehicle-card-10"));
    await user.click(await screen.findByTestId("select-apk-template"));
    await user.click(await screen.findByRole("option", { name: "APK herinnering" }));
    await user.click(screen.getByTestId("button-preview-apk"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("preview-subject")).toHaveTextContent("APK voor 97-GRD-4");
    expect(within(dialog).getByTestId("preview-content")).toHaveTextContent(
      `Beste Audit Testklant B.v., de APK van 97-GRD-4 (Toyota) verloopt op ${new Date("2026-12-31").toLocaleDateString("nl-NL")}.`,
    );
    // The address the route will use (primary), not the first one in the list.
    expect(within(dialog).getByTestId("preview-recipient-v10")).toHaveTextContent("audit@e2e.invalid");
    // One recipient: singular wording.
    expect(within(dialog).getByText("Klaar om 1 e-mail te versturen")).toBeInTheDocument();
  });
});

describe("D15 - plekhouders: wat de pagina meestuurt en laat zien", () => {
  it("een opgeslagen sjabloon wordt verstuurd met zijn templateId en categorie", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("vehicle-card-10"));
    await user.click(await screen.findByTestId("select-apk-template"));
    await user.click(await screen.findByRole("option", { name: "APK herinnering" }));
    await user.click(screen.getByTestId("button-preview-apk"));
    await user.click(await screen.findByTestId("button-confirm-send-notifications"));

    await waitFor(() => expect(sendBody).not.toBeNull());
    expect(sendBody).toMatchObject({ template: "custom", templateId: 1, category: "apk" });
  });

  it("een eigen bericht zonder sjabloon stuurt geen templateId mee", async () => {
    const user = userEvent.setup();
    renderPage();
    await customMessageToCustomers(user, "customer-card-1");
    await user.click(await screen.findByTestId("button-confirm-send-notifications"));
    await waitFor(() => expect(sendBody).not.toBeNull());
    expect(sendBody.templateId).toBeUndefined();
  });

  it("de voorvertoning vult bedrijfsnaam, e-mail, telefoon en de datums van de reservering per ontvanger", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-custom"));
    await user.click(await screen.findByTestId("customer-card-2"));
    await user.click(await screen.findByTestId("vehicle-card-custom-10"));
    await pasteInto(user, screen.getByTestId("input-custom-subject"), "Bericht van {companyName}");
    await pasteInto(user, screen.getByTestId("textarea-custom-message"),
      "Mail {customerEmail}, tel {customerPhone}, van {reservationStart} tot {reservationEnd}, onderhoud {maintenanceDate}.");
    await user.click(screen.getByTestId("button-preview-custom"));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByTestId("preview-subject")).toHaveTextContent("Bericht van Garage Voorbeeld"));
    expect(within(dialog).getByTestId("preview-content")).toHaveTextContent(
      "Mail audit@e2e.invalid, tel 06-11111111, van 01-10-2026 tot 09-10-2026, onderhoud .",
    );
    // The customer who was ticked without a vehicle has no reservation: those come out empty, and the note says so.
    await user.click(within(dialog).getByTestId("preview-recipient-c2"));
    expect(within(dialog).getByTestId("preview-content")).toHaveTextContent("Mail tweede@e2e.invalid, tel , van tot , onderhoud .");
    expect(within(dialog).getByTestId("preview-empty-note")).toHaveTextContent("Telefoon klant");
    expect(dialog.textContent).not.toContain("onbekende plekhouders");
  });

  it("de bouwer biedt de onderhoudsdatum alleen aan in een onderhoudssjabloon", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Sjabloonbouwer" }));
    await screen.findByTestId("template-card-1");
    // A new template starts as "Aangepast".
    for (const key of ["customerName", "companyName", "customerEmail", "customerPhone", "reservationStart", "reservationEnd"]) {
      expect(screen.getByTestId(`button-placeholder-${key}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("button-placeholder-maintenanceDate")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("button-edit-3"));
    expect(await screen.findByTestId("button-placeholder-maintenanceDate")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-edit-4"));
    await waitFor(() => expect(screen.queryByTestId("button-placeholder-maintenanceDate")).not.toBeInTheDocument());
  });
});

describe("A-13-2 - what a send comes to", () => {
  it("nothing was mailed: a destructive toast that says so, no 'succesvol', and the selection is kept", async () => {
    sendResponse = () => json({ success: true, sent: 0, failed: 1, errors: ["SEND_FAILED: Failed to send to audit@e2e.invalid for customer Audit Testklant B.v."] });
    const user = userEvent.setup();
    renderPage();
    await customMessageToCustomers(user, "customer-card-1");
    await user.click(await screen.findByTestId("button-confirm-send-notifications"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls.at(-1)![0];
    expect(toast.variant).toBe("destructive");
    expect(toast.title).toBe("Er is niets verstuurd");
    expect(toast.description).toContain("1 e-mail mislukt");
    expect(toast.description).toContain("E-maillogboek");
    expect(`${toast.title} ${toast.description}`).not.toMatch(/succesvol/i);
    // Kept, so the sender can try again.
    expect(screen.getByText("1 klant geselecteerd")).toBeInTheDocument();
    expect(screen.getByTestId("input-custom-subject")).toHaveValue("Nieuws voor {customerName}");
  });

  it("some went, some did not: says both counts and that it is partial", async () => {
    sendResponse = () => json({ success: true, sent: 2, failed: 1, errors: ["NO_ADDRESS: No suitable email for customer X"] });
    const user = userEvent.setup();
    renderPage();
    await customMessageToCustomers(user, "customer-card-1", "customer-card-2");
    await user.click(await screen.findByTestId("button-confirm-send-notifications"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls.at(-1)![0];
    expect(toast.title).toBe("Gedeeltelijk verstuurd");
    expect(toast.description).toContain("2 e-mails verstuurd");
    expect(toast.description).toContain("1 e-mail mislukt");
  });

  it("everything went: a plain success, and the form is emptied", async () => {
    const user = userEvent.setup();
    renderPage();
    await customMessageToCustomers(user, "customer-card-1");
    await user.click(await screen.findByTestId("button-confirm-send-notifications"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls.at(-1)![0];
    expect(toast.title).toBe("Meldingen verstuurd");
    expect(toast.description).toBe("1 e-mail verstuurd");
    expect(toast.variant).toBeUndefined();
    expect(screen.getByTestId("input-custom-subject")).toHaveValue("");
  });

  it("reads the e-mail log again after a send, so the new rows are in the log tab (found by the Layer B story)", async () => {
    sendResponse = () => json({ success: true, sent: 0, failed: 1, errors: ["SEND_FAILED: Failed to send to x"] });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(callsTo("/api/email-logs")).toHaveLength(1));
    await customMessageToCustomers(user, "customer-card-1");
    await user.click(await screen.findByTestId("button-confirm-send-notifications"));
    await waitFor(() => expect(callsTo("/api/email-logs").length).toBeGreaterThanOrEqual(2));
  });

  it("sends the address a recipient was changed to, for vehicle recipients", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("vehicle-card-10"));
    await user.click(await screen.findByTestId("select-apk-template"));
    await user.click(await screen.findByRole("option", { name: "APK herinnering" }));
    await user.click(screen.getByTestId("button-preview-apk"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("preview-email-select-v10"));
    await user.click(await screen.findByRole("option", { name: /APK\/MOT/ }));
    await user.click(within(dialog).getByTestId("button-confirm-send-notifications"));

    await waitFor(() => expect(sendBody).not.toBeNull());
    expect(sendBody.individualEmailSelections).toEqual({ "10": "emailForMOT" });
    expect(sendBody.vehicleIds).toEqual([10]);
  });
});

describe("A-13-12 - a mass send needs a second confirmation", () => {
  it("from 25 recipients the send stays off until the box is ticked", async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ ...CUSTOMER_B, id: 100 + i, name: `Klant ${i}`, email: `k${i}@e2e.invalid` }));
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url.includes("/api/customers")) return json(many);
      if (url.includes("/api/email-templates")) return json(templates);
      if (url.includes("/api/notifications/send")) { sendBody = JSON.parse(String(init?.body)); return sendResponse(); }
      return json([]);
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-custom"));
    for (let i = 0; i < 26; i++) {
      // 50 are listed; the cards are real elements.
      await user.click(await screen.findByTestId(`customer-card-${100 + i}`));
    }
    await user.type(screen.getByTestId("input-custom-subject"), "Nieuws");
    await user.type(screen.getByTestId("textarea-custom-message"), "Bericht");
    await user.click(screen.getByTestId("button-preview-custom"));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByTestId("button-confirm-send-notifications");
    expect(within(dialog).getByTestId("mass-send-warning")).toHaveTextContent("26 ontvangers");
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByTestId("mass-send-acknowledge"));
    expect(confirm).toBeEnabled();
  }, 30_000);

  it("a small send has no extra step", async () => {
    const user = userEvent.setup();
    renderPage();
    await customMessageToCustomers(user, "customer-card-1");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByTestId("mass-send-warning")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("button-confirm-send-notifications")).toBeEnabled();
  });
});

describe("A-13-13 and the log in Dutch", () => {
  const ROWS = [
    {
      id: 7, template: "custom", subject: "Mislukte testmail", recipients: 1, emailsSent: 0, emailsFailed: 1,
      failureReason: "NO_EMAIL_CONFIG: No valid email configuration for purpose: custom", vehicleIds: [],
      sentAt: "2026-10-09T12:00:00.000Z", recipient: "audit@e2e.invalid", result: "failed", documentId: null,
    },
    {
      id: 8, template: "documents", subject: "Contract AB-12-CD", recipients: 1, emailsSent: 1, emailsFailed: 0, failureReason: null,
      vehicleIds: [], sentAt: "2026-10-08T12:00:00.000Z", recipient: "klant@e2e.invalid", result: "sent", documentId: 31,
    },
    {
      id: 9, template: "portal_invite", subject: "Uitnodiging", recipients: 1, emailsSent: 0, emailsFailed: 1,
      failureReason: "ETIMEDOUT: Connection to email server timed out.", vehicleIds: [],
      sentAt: "2026-10-07T12:00:00.000Z", recipient: "p@e2e.invalid", result: "failed", documentId: null,
    },
    {
      id: 10, template: "custom", subject: "Ronde", recipients: 3, emailsSent: 1, emailsFailed: 2,
      failureReason: "NO_ADDRESS: No suitable email for customer A; NO_ADDRESS: No suitable email for customer B",
      vehicleIds: [], sentAt: "2026-10-06T12:00:00.000Z", recipient: null, result: null, documentId: null,
    },
    {
      id: 11, template: "custom", subject: "Oude regel", recipients: 1, emailsSent: 0, emailsFailed: 1,
      failureReason: "No valid email configuration for purpose: custom", vehicleIds: [],
      sentAt: "2026-10-05T12:00:00.000Z", recipient: "oud@e2e.invalid", result: "failed", documentId: null,
    },
  ];

  async function openLog(user: ReturnType<typeof userEvent.setup>) {
    logRows = ROWS;
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "E-maillogboek" }));
    return screen.findAllByTestId("email-log-row");
  }

  it("shows a Dutch kind for every row, never the raw template key", async () => {
    const rows = await openLog(userEvent.setup());
    expect(within(rows[0]).getByText(/Aangepast bericht/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Document/)).toBeInTheDocument();
    expect(within(rows[2]).queryByText(/portal_invite/)).not.toBeInTheDocument();
    expect(within(rows[2]).getByText(/Overige e-mail/)).toBeInTheDocument();
  });

  it("B-41 D10: the fine mail from the button shows as a fine mail, not as Overige e-mail", async () => {
    logRows = [{
      id: 12, template: "fine_linked", subject: "Nieuwe bekeuring AB-12-CD", recipients: 1, emailsSent: 1, emailsFailed: 0, failureReason: null,
      vehicleIds: [], sentAt: "2026-10-11T12:00:00.000Z", recipient: "klant@e2e.invalid", result: "sent", documentId: null,
    }];
    renderPage();
    await userEvent.setup().click(await screen.findByRole("tab", { name: "E-maillogboek" }));
    const [row] = await screen.findAllByTestId("email-log-row");
    expect(within(row).getByText(/Bekeuring/)).toBeInTheDocument();
    expect(within(row).queryByText(/fine_linked/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/Overige e-mail/)).not.toBeInTheDocument();
  });

  it("shows the reason in Dutch with the stored text kept as the detail", async () => {
    const rows = await openLog(userEvent.setup());
    expect(within(rows[0]).getByText(/geen werkende e-mailconfiguratie/i)).toBeInTheDocument();
    expect(within(rows[0]).getByText("NO_EMAIL_CONFIG: No valid email configuration for purpose: custom")).toBeInTheDocument();
    expect(within(rows[2]).getByText(/duurde te lang/i)).toBeInTheDocument();
    // A run counts its reasons per code.
    expect(within(rows[3]).getByText(/2× Geen geschikt e-mailadres/)).toBeInTheDocument();
    // A row from before the codes: the generic Dutch line plus the stored text.
    expect(within(rows[4]).getByText(/Verzenden mislukt/)).toBeInTheDocument();
    expect(within(rows[4]).getByText("No valid email configuration for purpose: custom")).toBeInTheDocument();
  });

  it("opens a detail view of a row with everything the log knows, and says the body is not kept", async () => {
    const user = userEvent.setup();
    const rows = await openLog(user);
    await user.click(within(rows[0]).getByTestId("button-email-log-detail-7"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Mislukte testmail" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("email-log-detail-recipient")).toHaveTextContent("audit@e2e.invalid");
    expect(within(dialog).getByTestId("email-log-detail-status")).toHaveTextContent("mislukt");
    expect(within(dialog).getByTestId("email-log-detail-reason")).toHaveTextContent(/geen werkende e-mailconfiguratie/i);
    expect(within(dialog).getByTestId("email-log-detail-raw")).toHaveTextContent("NO_EMAIL_CONFIG: No valid email configuration for purpose: custom");
    expect(within(dialog).getByTestId("email-log-detail-body-note")).toHaveTextContent("niet bewaard");
    await user.click(within(dialog).getByTestId("button-email-log-detail-close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("final wave A, item 9 - minors carried from the P3 review", () => {
  it("a system (portal) template keeps its name: the field is disabled and shows the Dutch name", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Sjabloonbouwer" }));
    await screen.findByTestId("template-card-2");
    await user.click(screen.getByTestId("button-edit-2"));
    const name = screen.getByLabelText("Sjabloonnaam");
    expect(name).toBeDisabled();
    expect(name).toHaveValue("Portaal: uitnodiging");
    // An ordinary template stays renameable.
    await user.click(screen.getByTestId("button-edit-4"));
    expect(screen.getByLabelText("Sjabloonnaam")).toBeEnabled();
    expect(screen.getByLabelText("Sjabloonnaam")).toHaveValue("Algemeen bericht");
  });

  it("a send that handled no recipient at all says nobody was there to mail, not '0 e-mails mislukt'", async () => {
    sendResponse = () => json({ success: true, sent: 0, failed: 0, errors: [] });
    const user = userEvent.setup();
    renderPage();
    await customMessageToCustomers(user, "customer-card-1");
    await user.click(await screen.findByTestId("button-confirm-send-notifications"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls.at(-1)![0];
    expect(toast.title).toBe("Er is niets verstuurd");
    expect(toast.description).toContain("Er was niemand om naar te mailen");
    expect(toast.description).not.toContain("mislukt");
    expect(toast.variant).toBe("destructive");
  });

  it("a template chosen on one tab is not still selected after a trip to another tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("select-apk-template"));
    await user.click(await screen.findByRole("option", { name: "APK herinnering" }));
    expect(screen.getByTestId("select-apk-template")).toHaveTextContent("APK herinnering");
    await user.click(screen.getByTestId("tab-maintenance"));
    await user.click(screen.getByTestId("tab-apk"));
    expect(await screen.findByTestId("select-apk-template")).not.toHaveTextContent("APK herinnering");
  });

  it("the recipient rows of the send preview can be chosen from the keyboard", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-custom"));
    await user.click(await screen.findByTestId("customer-card-2"));
    await user.click(await screen.findByTestId("vehicle-card-custom-10"));
    await pasteInto(user, screen.getByTestId("input-custom-subject"), "Nieuws voor {customerName}");
    await pasteInto(user, screen.getByTestId("textarea-custom-message"), "Hallo {customerName}");
    await user.click(screen.getByTestId("button-preview-custom"));
    const dialog = await screen.findByRole("dialog");
    const second = within(dialog).getByTestId("preview-recipient-c2");
    expect(within(dialog).getByTestId("preview-subject")).toHaveTextContent("Nieuws voor Audit Testklant B.v.");

    second.focus();
    expect(second).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(within(dialog).getByTestId("preview-subject")).toHaveTextContent("Nieuws voor Tweede Klant");
    expect(second).toHaveAttribute("aria-current", "true");
    await user.keyboard(" ");
    expect(within(dialog).getByTestId("preview-subject")).toHaveTextContent("Nieuws voor Tweede Klant");
  });
});
