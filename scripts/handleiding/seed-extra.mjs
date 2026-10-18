/**
 * Extra testgegevens voor de hoofdstukken Kosten en facturen (19) en Klantenportaal en
 * bekeuringen (20): ontvangen facturen in het factuurpostvak, bekeuringen en portaalaanvragen.
 * Draai na seed.mjs. Alleen voor de E2E-testdatabase lvs_e2e (die bij elke start opnieuw wordt
 * opgebouwd); alle namen, kentekens, bedragen en factuurnummers zijn verzonnen.
 *
 * Facturen en aanvragen komen normaal van buiten (een mailbox, het klantenportaal). Die bronnen
 * zijn er in de testomgeving niet, dus deze regels gaan rechtstreeks in de testdatabase. De
 * factuur-PDF wordt hier zelf gemaakt.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { ROOT, api, launch, login, ymd } from "./lib.mjs";

const DATABASE_URL = process.env.HANDLEIDING_DB || "postgresql://postgres:postgres@localhost:5432/lvs_e2e";
if (!DATABASE_URL.endsWith("/lvs_e2e")) throw new Error("Alleen voor de testdatabase lvs_e2e.");
const UPLOADS = path.join(ROOT, "e2e", ".tmp", "uploads");

const INVOICES = [
  {
    file: "handleiding-factuur-visser-2026-0871.pdf", vendor: "Garage Visser", invoiceNumber: "2026-0871", plate: "43-DCT-6",
    lines: [{ description: "Remblokken voor vervangen", amount: 186.5, category: "maintenance" }, { description: "Arbeid 1,5 uur", amount: 112.5, category: "maintenance" }],
    reason: "unknown_sender",
  },
  {
    file: "handleiding-factuur-bandenland-5512.pdf", vendor: "Bandenland Rotterdam", invoiceNumber: "BL-5512", plate: null,
    lines: [{ description: "4 winterbanden 215/65 R16", amount: 548, category: "tires" }],
    reason: "no_plate",
  },
];

function invoiceHtml(inv) {
  const subtotal = inv.lines.reduce((s, l) => s + l.amount, 0);
  const vat = Math.round(subtotal * 21) / 100;
  const rows = inv.lines.map((l) => `<tr><td>${l.description}</td><td style="text-align:right">€ ${l.amount.toFixed(2).replace(".", ",")}</td></tr>`).join("");
  return `<!doctype html><html><body style="font-family:Arial;padding:40px;color:#222">
    <h1 style="margin:0">${inv.vendor}</h1><p>Voorbeeldstraat 1, 3000 AA Rotterdam (verzonnen testfactuur)</p>
    <h2>Factuur ${inv.invoiceNumber}</h2><p>Datum: ${ymd(-3)}<br>Aan: Auto Lease LAM${inv.plate ? `<br>Kenteken: ${inv.plate}` : ""}</p>
    <table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">${rows}
    <tr><td>Subtotaal</td><td style="text-align:right">€ ${subtotal.toFixed(2).replace(".", ",")}</td></tr>
    <tr><td>Btw 21%</td><td style="text-align:right">€ ${vat.toFixed(2).replace(".", ",")}</td></tr>
    <tr><td><b>Totaal</b></td><td style="text-align:right"><b>€ ${(subtotal + vat).toFixed(2).replace(".", ",")}</b></td></tr></table>
  </body></html>`;
}

const { browser, page } = await launch();
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
try {
  await login(page, { username: "e2e-admin" });
  const vehicles = await api(page, "GET", "/api/vehicles");
  const customers = await api(page, "GET", "/api/customers");
  const reservations = await api(page, "GET", "/api/reservations");
  const vehicle = (plate) => vehicles.find((v) => v.licensePlate === plate);
  const customer = (name) => customers.find((c) => c.name === name);

  // 1. Factuurpostvak: twee facturen die op controle wachten, met een PDF en een ophaalronde.
  const { rows: existingInbox } = await db.query("select count(*)::int as n from invoice_inbox_items");
  if (existingInbox[0].n === 0) {
    const dir = path.join(UPLOADS, "invoice-inbox");
    fs.mkdirSync(dir, { recursive: true });
    for (const [i, inv] of INVOICES.entries()) {
      const pdfPage = await browser.newPage();
      await pdfPage.setContent(invoiceHtml(inv));
      const bytes = await pdfPage.pdf({ format: "A4" });
      await pdfPage.close();
      fs.writeFileSync(path.join(dir, inv.file), bytes);
      const subtotal = inv.lines.reduce((s, l) => s + l.amount, 0);
      const vat = Math.round(subtotal * 21) / 100;
      const parsed = {
        vendor: inv.vendor, invoiceNumber: inv.invoiceNumber, invoiceDate: ymd(-3), currency: "EUR",
        totalAmount: subtotal + vat, subtotalAmount: subtotal, vatAmount: vat, lineItems: inv.lines, documentType: "invoice",
        ...(inv.plate ? { vehicleInfo: { licensePlate: inv.plate }, plates: [inv.plate.replace(/-/g, "")] } : { plates: [] }),
      };
      await db.query(
        `insert into invoice_inbox_items (message_id, from_address, subject, mail_date, attachment_name, attachment_path, attachment_hash,
           attachment_content_type, invoice_hash, parsed, status, review_reason, vehicle_id, received_at)
         values ($1,$2,$3, now() - ($4 || ' hours')::interval, $5, $6, $7, 'application/pdf', $8, $9, 'review', $10, $11, now() - ($4 || ' hours')::interval)`,
        [`<handleiding-${i}@test.example>`, `facturen@${inv.vendor.toLowerCase().replace(/[^a-z]/g, "")}.example`, `Factuur ${inv.invoiceNumber}`, String(5 + i * 20),
          inv.file, `invoice-inbox/${inv.file}`, crypto.createHash("sha256").update(bytes).digest("hex"),
          crypto.createHash("sha256").update(`${inv.vendor}|${inv.invoiceNumber}`).digest("hex"), JSON.stringify(parsed), inv.reason,
          inv.plate ? vehicle(inv.plate)?.id ?? null : null],
      );
    }
    await db.query(
      `insert into invoice_inbox_runs (started_at, finished_at, trigger, mails, attachments, booked, review, skipped, failed, errors)
       values (now() - interval '5 hours', now() - interval '5 hours' + interval '9 seconds', 'scheduler', 2, 2, 0, 2, 0, 0, '[]')`,
    ).catch((e) => console.log("  ophaalronde niet toegevoegd:", e.message.slice(0, 120)));
    console.log(`  ${INVOICES.length} facturen in het postvak gezet`);
  }

  // 2. Bekeuringen: één die vanzelf aan de huur van de Proace koppelt (die huur liep toen), en één op de
  //    Crafter een dag vóór een geboekte huur: die koppelt niet vanzelf, de app stelt die huur wel voor.
  const fines = await api(page, "GET", "/api/fines").catch(() => []);
  const fineList = Array.isArray(fines) ? fines : fines.fines ?? fines.items ?? [];
  if (!fineList.length) {
    await api(page, "POST", "/api/fines", {
      licensePlate: "65-PRC-8", offenceAt: `${ymd(-4)}T10:42:00.000Z`, receivedAt: ymd(-1), reference: "CJIB-3001-2026-04471",
      description: "Snelheidsovertreding 12 km/u te hard, Maasboulevard Rotterdam", amount: "104",
    });
    await api(page, "POST", "/api/fines", {
      licensePlate: "12-VKL-3", offenceAt: `${ymd(-1)}T15:05:00.000Z`, receivedAt: ymd(-2), reference: "CJIB-3001-2026-04502",
      description: "Parkeren op een laad- en losplaats, Coolsingel Rotterdam", amount: "110",
    });
    console.log("  2 bekeuringen toegevoegd");
  }

  // 3. Portaalaanvragen, zoals een klant ze in het portaal zou indienen.
  const { rows: existingRequests } = await db.query("select count(*)::int as n from portal_requests");
  if (existingRequests[0].n === 0) {
    const hoveniers = customer("Hoveniersbedrijf Groen");
    const bakkerij = customer("Bakkerij Van Dijk B.V.");
    const jansen = customer("Installatiebedrijf Jansen");
    const overdue = reservations.find((r) => (r.notes || "").includes("handleiding:achterstallig"));
    const jansenRes = reservations.find((r) => r.customerId === jansen?.id) ?? overdue;
    const sprinter = vehicle("34-SPR-5");
    // De app maakt alleen een vervanger als het onderhoud binnen de huur valt: kies een werkdag in die huur.
    const insideRental = (r) => {
      if (!r?.startDate) return ymd(5);
      const d = new Date(`${r.startDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    const add = (customerId, type, reservationId, payload, message, hoursAgo) => db.query(
      `insert into portal_requests (customer_id, type, reservation_id, payload, message, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,'new', now() - ($6 || ' hours')::interval, now() - ($6 || ' hours')::interval)`,
      [customerId, type, reservationId, JSON.stringify(payload), message, String(hoursAgo)],
    );
    await add(hoveniers.id, "extension", overdue?.id ?? null, { newEndDate: ymd(3) }, "Het werk in Rozenburg loopt uit. Mogen we de bus drie dagen langer houden?", 2);
    await add(bakkerij.id, "booking", null, { vehicleId: sprinter.id, startDate: ymd(20), endDate: ymd(24), vehicleLabel: "Mercedes-Benz Sprinter (34-SPR-5)" }, "Voor de kerstmarkt hebben we een extra bus nodig.", 26);
    await add(jansen.id, "maintenance", jansenRes?.id ?? null, { issue: "Het lampje van de motorstoring brandt sinds vanochtend.", mileage: 62300, urgent: false, needsReplacement: true, preferredDate: insideRental(jansenRes) }, "Graag een afspraak voor de werkplaats, liefst met een vervangende bus.", 80);
    console.log("  3 portaalaanvragen toegevoegd");
  }
} finally {
  await db.end();
  await browser.close();
}
console.log("Klaar.");
