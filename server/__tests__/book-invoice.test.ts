import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { registerExpenseRoutes } from "../routes/expenses";
import { bookInvoiceAsExpenses, groupLinesByCategory, invoiceExpenseDescription, resolveInvoiceFile, receiptFromStoredPath } from "../services/expenses/book-invoice";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission } from "../../shared/schema";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("book-invoice helper", () => {
  it("groups lines per category, summing in cents and keeping distinct descriptions", () => {
    const grouped = groupLinesByCategory([
      { description: "Olie", amount: 0.1, category: "Maintenance" },
      { description: "Filter", amount: 0.2, category: "Maintenance" },
      { description: "Olie", amount: 10, category: "Maintenance" },
      { description: "Remblokken", amount: 55.5, category: "Brakes" },
    ]);
    expect(grouped).toEqual([
      { category: "Maintenance", amount: 10.3, description: "Olie • Filter" },
      { category: "Brakes", amount: 55.5, description: "Remblokken" },
    ]);
  });

  it("writes the description the way the cost overview shows it", () => {
    expect(invoiceExpenseDescription({ description: "Grote beurt", amount: 1, category: "Maintenance" }, { vendor: "Garage Jansen", invoiceNumber: "2026-0412" }))
      .toBe("Grote beurt (Factuur 2026-0412, Garage Jansen)");
    expect(invoiceExpenseDescription({ description: "Tanken", amount: 1, category: "Fuel" }, { vendor: "", invoiceNumber: " " }))
      .toBe("Tanken (Factuur onbekend, onbekende leverancier)");
  });

  it("only accepts stored files inside the two invoice folders", () => {
    expect(resolveInvoiceFile("../../.env")).toBeNull();
    expect(resolveInvoiceFile("/etc/passwd")).toBeNull();
    expect(resolveInvoiceFile(null)).toBeNull();
    expect(receiptFromStoredPath("invoices/bestaat-niet.pdf")).toBeNull();
  });
});

describe("booking invoices as expenses", () => {
  const invoicesDir = path.join(getUploadsDir(), "invoices");
  const files: string[] = [];
  let vehicleId: number;
  const app = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], (a) => registerExpenseRoutes(a, { upload: multer({ dest: os.tmpdir() }) } as any));

  const storedPdf = (): string => {
    fs.mkdirSync(invoicesDir, { recursive: true });
    const abs = path.join(invoicesDir, `${TEST_PREFIX}${unique()}.pdf`);
    fs.writeFileSync(abs, `%PDF-1.4\n% ${unique()}\n%%EOF`);
    files.push(abs);
    return path.relative(getUploadsDir(), abs).split(path.sep).join("/");
  };

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-BK-01")).id;
  });
  afterAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    for (const f of files) fs.rmSync(f, { force: true });
  });

  it("creates one expense per line with the receipt and the inbox item attached", async () => {
    const item = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "review", createdBy: INBOX_TEST_ACTOR });
    const receipt = receiptFromStoredPath(storedPdf());
    expect(receipt).not.toBeNull();
    const { expenses, errors } = await bookInvoiceAsExpenses({
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: "F-1", invoiceDate: "2026-09-10" },
      vehicleId, receipt, inboxItemId: item.id, createdBy: INBOX_TEST_ACTOR,
      lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }, { description: "Remblokken", amount: 55.5, category: "Brakes" }],
    });
    expect(errors).toEqual([]);
    expect(expenses).toHaveLength(2);
    expect(expenses[0]).toMatchObject({
      vehicleId, category: "Maintenance", amount: "100", date: "2026-09-10", inboxItemId: item.id,
      description: `Grote beurt (Factuur F-1, ${TEST_PREFIX}Garage)`, receiptFilePath: receipt!.relativePath,
      receiptFile: receipt!.fileName, receiptFileSize: receipt!.size, receiptContentType: "application/pdf", createdBy: INBOX_TEST_ACTOR,
    });
  });

  it("reports a line it could not book and still books the others", async () => {
    const { expenses, errors } = await bookInvoiceAsExpenses({
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: "F-2", invoiceDate: "2026-09-10" }, vehicleId, createdBy: INBOX_TEST_ACTOR,
      lineItems: [{ description: "Goed", amount: 10, category: "Other" }, { description: "Nul", amount: 0, category: "Other" }],
    });
    expect(expenses).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Nul");
  });

  it("manual scan: books through the helper, then refuses the same invoice a second time", async () => {
    const number = `M-${unique()}`;
    const body = {
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: number, invoiceDate: "2026-09-10", totalAmount: 121 },
      vehicleId, filePath: storedPdf(), lineItems: [{ description: "Beurt", amount: 100, category: "Maintenance" }],
    };
    const first = await request(app).post("/api/expenses/from-invoice").send(body);
    expect(first.status).toBe(200);
    expect(first.body.expenses).toHaveLength(1);
    expect(first.body.expenses[0].receiptFilePath).toBe(body.filePath);
    expect(first.body.expenses[0].inboxItemId).toBe(first.body.inboxItemId);
    const item = await inboxStorage.get(first.body.inboxItemId);
    expect(item).toMatchObject({ status: "booked", vehicleId, fromAddress: null, expenseIds: [first.body.expenses[0].id] });

    // Same invoice, scanned again into a different file: refused on the invoice hash.
    const again = await request(app).post("/api/expenses/from-invoice").send({ ...body, filePath: storedPdf() });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ inboxItemId: first.body.inboxItemId, status: "booked" });
    expect(again.body.message).toMatch(/al geboekt/);
  });

  it("manual scan: a path outside the invoice folders is ignored, never stored", async () => {
    const res = await request(app).post("/api/expenses/from-invoice").send({
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: `M-${unique()}`, invoiceDate: "2026-09-10", totalAmount: 10 },
      vehicleId, filePath: "../../.env", lineItems: [{ description: "Los", amount: 10, category: "Other" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.expenses[0].receiptFilePath).toBeNull();
  });

  it("manual scan: keeps its validation answers", async () => {
    expect((await request(app).post("/api/expenses/from-invoice").send({ vehicleId })).status).toBe(400);
    const unknownVehicle = await request(app).post("/api/expenses/from-invoice").send({
      invoice: { vendor: "x", invoiceNumber: "", invoiceDate: "2026-09-10", totalAmount: 1 }, vehicleId: 99999999,
      lineItems: [{ description: "x", amount: 1, category: "Other" }],
    });
    expect(unknownVehicle.status).toBe(404);
  });
});
