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

  // 4. Onderhoudsanalyse (hoofdstuk 21.9), alleen met --onderhoud: extra Transits en Sprinters,
  //    onderhoudskosten met een leverancier en maandelijkse km-standen in verschillende km-klassen.
  //    Apart aan te zetten, omdat de extra auto's anders de foto's van andere hoofdstukken veranderen.
  if (process.argv.includes("--onderhoud")) await seedMaintenanceAnalysis(page, db, vehicles);
} finally {
  await db.end();
  await browser.close();
}
console.log("Klaar.");

/**
 * Onderhoudsanalyse: vijf Ford Transits in vier km-klassen (een nieuwe met 12.000 km tot een oude met
 * 200.000 km), drie Ford Transit Customs, vijf Mercedes Sprinters waarvan vier in de klasse 100–150.000 (één daarvan veel duurder,
 * dus een signaal), kosten per maand in 2026 bij vijf leveranciers, één auto met stijgende kosten en één
 * met twee keer remmen binnen 90 dagen.
 */
async function seedMaintenanceAnalysis(page, db, existing) {
  const year = new Date().getFullYear();
  const day = (month, d = 10) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const FORD = "Ford Dealer Spijkenisse";
  const MB = "Mercedes-Benz Rotterdam";
  const VISSER = "Garage Visser";
  const BANDEN = "Bandenland Rotterdam";
  const REMMEN = "Remmenspecialist Zuid";
  const fleet = [
    { plate: "31-FTR-1", brand: "Ford", model: "Transit", built: `${year - 1}-03-01`, startKm: 12_000, pace: 2_400, costs: [
      [3, "maintenance", 185, FORD, "Eerste beurt"], [9, "maintenance", 95, VISSER, "Ruitenwissers en controle"]] },
    { plate: "56-TRN-7", brand: "Ford", model: "Transit", startKm: null, pace: 2_100, costs: [
      [2, "maintenance", 240, FORD, "Kleine beurt"], [6, "tires", 520, BANDEN, "Vier banden"], [9, "maintenance", 310, FORD, "Grote beurt"]] },
    { plate: "33-FTR-3", brand: "Ford", model: "Transit", built: "2018-05-01", startKm: 120_000, pace: 2_800, costs: [
      [1, "maintenance", 420, VISSER, "Grote beurt"], [4, "brakes", 380, REMMEN, "Remblokken en schijven voor"],
      [6, "maintenance", 120, VISSER, "Olie bijvullen en controle"], [7, "tires", 260, BANDEN, "Twee banden"],
      [8, "maintenance", 410, VISSER, "Grote beurt"], [9, "brakes", 520, REMMEN, "Remschijven rondom"]] },
    { plate: "34-FTR-4", brand: "Ford", model: "Transit", built: "2015-02-01", startKm: 200_000, pace: 2_600, costs: [
      [1, "maintenance", 690, VISSER, "Koppeling"], [2, "brakes", 410, REMMEN, "Remmen achter"],
      [4, "maintenance", 980, VISSER, "Turbo vervangen"], [5, "brakes", 360, REMMEN, "Remmen achter opnieuw"],
      [6, "maintenance", 1250, VISSER, "Versnellingsbak revisie"]] },
    { plate: "35-FTR-5", brand: "Ford", model: "Transit", built: "2021-09-01", startKm: 64_000, pace: 2_500, costs: [
      [3, "maintenance", 260, FORD, "Kleine beurt"], [8, "tires", 480, BANDEN, "Vier banden"]] },
    // Een tweede type van Ford, zodat het merkfilter twee typen toont: drie zuinige Transit Customs.
    { plate: "51-FTC-1", brand: "Ford", model: "Transit Custom", built: "2022-04-01", startKm: 52_000, pace: 2_200, costs: [
      [2, "maintenance", 210, FORD, "Kleine beurt"], [8, "maintenance", 230, FORD, "Kleine beurt"]] },
    { plate: "52-FTC-2", brand: "Ford", model: "Transit Custom", built: "2022-09-01", startKm: 58_000, pace: 2_000, costs: [
      [4, "maintenance", 220, FORD, "Kleine beurt"], [7, "tires", 430, BANDEN, "Vier banden"]] },
    { plate: "53-FTC-3", brand: "Ford", model: "Transit Custom", built: "2023-01-01", startKm: 41_000, pace: 2_300, costs: [
      [5, "maintenance", 195, FORD, "Eerste grote beurt"], [9, "brakes", 260, REMMEN, "Remblokken voor"]] },
    { plate: "41-MBS-1", brand: "Mercedes-Benz", model: "Sprinter", built: "2020-04-01", startKm: 104_000, pace: 3_000, costs: [
      [2, "maintenance", 380, MB, "Grote beurt"], [6, "tires", 600, BANDEN, "Vier banden"], [9, "brakes", 340, REMMEN, "Remblokken voor"]] },
    { plate: "42-MBS-2", brand: "Mercedes-Benz", model: "Sprinter", built: "2019-06-01", startKm: 112_000, pace: 3_000, costs: [
      [3, "maintenance", 410, MB, "Grote beurt"], [7, "brakes", 300, REMMEN, "Remblokken achter"]] },
    { plate: "43-MBS-3", brand: "Mercedes-Benz", model: "Sprinter", built: "2019-11-01", startKm: 108_000, pace: 3_200, costs: [
      [1, "maintenance", 395, MB, "Grote beurt"], [5, "tires", 580, BANDEN, "Vier banden"], [10, "maintenance", 150, VISSER, "Lampen en controle"]] },
    { plate: "44-MBS-4", brand: "Mercedes-Benz", model: "Sprinter", built: "2019-02-01", startKm: 110_000, pace: 3_100, costs: [
      [1, "maintenance", 950, MB, "Injectoren"], [3, "maintenance", 1400, MB, "AdBlue-systeem"], [5, "brakes", 620, REMMEN, "Remschijven rondom"],
      [7, "maintenance", 1100, MB, "Turbo"], [9, "tires", 640, BANDEN, "Vier banden"]] },
  ];


  let list = existing;
  for (const v of fleet) {
    if (list.some((x) => x.licensePlate === v.plate)) continue;
    const endKm = v.startKm + v.pace * 9;
    await api(page, "POST", "/api/vehicles", {
      licensePlate: v.plate, brand: v.brand, model: v.model, vehicleType: "Van", fuel: "diesel", currentMileage: endKm,
      productionDate: v.built, apkDate: ymd(200), availabilityStatus: "available", registeredTo: "opnaam", company: "Auto Lease LAM",
    });
  }
  list = await api(page, "GET", "/api/vehicles");

  let readings = 0;
  let costs = 0;
  for (const v of fleet) {
    const vehicle = list.find((x) => x.licensePlate === v.plate);
    if (!vehicle) throw new Error(`Voertuig ${v.plate} niet gevonden`);
    // Al gezaaid (een eerdere run): deze auto overslaan.
    const { rows: had } = await db.query("select count(*)::int as n from expenses where vehicle_id = $1 and created_by = 'Handleiding'", [vehicle.id]);
    if (had[0].n > 0) continue;
    // Een bestaande auto eindigt op zijn huidige km-stand.
    const startKm = v.startKm ?? Math.max(0, Number(vehicle.currentMileage ?? 0) - v.pace * 9);
    for (let m = 1; m <= 10; m += 1) {
      await db.query(
        `insert into vehicle_mileage_readings (vehicle_id, mileage, recorded_at, source, actor_name)
         values ($1, $2, $3::timestamptz, 'manual', 'Handleiding')`,
        [vehicle.id, startKm + v.pace * (m - 1), `${day(m, 5)}T09:00:00+02:00`],
      );
      readings += 1;
    }
    for (const [month, category, amount, supplier, description] of v.costs) {
      await db.query(
        `insert into expenses (vehicle_id, category, amount, date, description, supplier, created_by)
         values ($1, $2, $3, $4, $5, $6, 'Handleiding')`,
        [vehicle.id, category, amount, day(month), description, supplier],
      );
      costs += 1;
    }
  }
  console.log(`  onderhoudsanalyse: ${fleet.length} auto's, ${readings} km-standen, ${costs} kostenposten`);
}
