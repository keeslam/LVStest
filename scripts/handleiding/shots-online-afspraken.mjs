/**
 * Hoofdstuk 7, 9 en 19: online afspraken uit de garageplanner.
 *
 * Een afspraak komt alleen binnen als mail in het factuurpostvak; die is er in de testdata niet.
 * De eerste stap zet daarom rechtstreeks in de testdatabase lvs_e2e (zoals shots-portal-apk.mjs):
 *  - een afspraak "te bevestigen" met een onderhoudsregel op de eerstvolgende werkdag over een week,
 *    voor de auto van een opgehaalde huur;
 *  - een afspraak "om te controleren" met een kenteken dat niet in de vloot staat.
 * De tabel online_appointments maakt de server zelf aan bij het starten (startup-migration.js).
 * De laatste stap haalt alles weer weg. Draai dit niet op een echte database.
 *
 *   node scripts/handleiding/run.mjs online-afspraken     alle stappen van dit bestand, opruimen incl.
 */
import pg from "pg";
import { closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

const DATABASE_URL = process.env.HANDLEIDING_DB || "postgresql://postgres:postgres@localhost:5432/lvs_e2e";
const PREFIX = "<handleiding-online-afspraak-";

const state = { blockId: null, pendingId: null, prepared: false };

/** De eerste werkdag (ma-vr) die minstens `offset` dagen verder ligt, als yyyy-MM-dd. */
function weekday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function withDb(fn) {
  if (!DATABASE_URL.endsWith("/lvs_e2e")) throw new Error("Alleen voor de testdatabase lvs_e2e.");
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function cleanup(db) {
  const { rows } = await db.query("select block_id from online_appointments where message_id like $1", [`${PREFIX}%`]);
  await db.query("delete from online_appointments where message_id like $1", [`${PREFIX}%`]);
  for (const r of rows) if (r.block_id) await db.query("delete from reservations where id = $1 and type = 'maintenance_block'", [r.block_id]);
}

/** Twee afspraken: één te bevestigen (met onderhoudsregel), één om te controleren. */
async function prepare() {
  if (state.prepared) return;
  await withDb(async (db) => {
    await cleanup(db);
    const date = weekday(7);
    const { rows } = await db.query(
      `select r.id, r.customer_id, r.vehicle_id, v.license_plate, v.brand, v.model
         from reservations r join vehicles v on v.id = r.vehicle_id
        where r.status = 'picked_up' and r.type = 'standard' and r.deleted_at is null and r.customer_id is not null
          and r.start_date <= $1 and (r.end_date is null or r.end_date >= $1)
        order by r.id limit 1`,
      [date],
    );
    if (!rows.length) throw new Error("Geen opgehaalde huur die over een week nog loopt in de testdata.");
    const r = rows[0];
    const plate = String(r.license_plate).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const block = await db.query(
      `insert into reservations (vehicle_id, customer_id, start_date, end_date, status, type, maintenance_status, maintenance_category,
         maintenance_type, maintenance_duration, affected_rental_id, start_time, placeholder_spare, notes, created_by, updated_by)
       values ($1, $2, $3, $3, 'booked', 'maintenance_block', 'scheduled', 'scheduled_maintenance', 'apk_inspection', 1, $4, '08:00', false,
         'apk_inspection: APK' || chr(10) || 'Online agenda: te bevestigen (08:00)', 'scheduler', 'scheduler')
       returning id`,
      [r.vehicle_id, r.customer_id, date, r.id],
    );
    state.blockId = block.rows[0].id;
    const pending = await db.query(
      `insert into online_appointments (message_id, status, appointment_date, appointment_time, plate, brand, model, mileage, work_items,
         replacement, customer_name, subject, from_address, vehicle_id, customer_id, rental_id, block_id)
       values ($1, 'pending', $2, '08:00', $3, $4, $5, 48210, '["APK"]'::jsonb, 'Leenauto', 'Dhr. P. de Vries', 'Afspraak Aanvraag',
         'noreply@garage.software', $6, $7, $8, $9)
       returning id`,
      [`${PREFIX}1>`, date, plate, r.brand ?? "", r.model ?? "", r.vehicle_id, r.customer_id, r.id, state.blockId],
    );
    state.pendingId = pending.rows[0].id;
    await db.query(
      `insert into online_appointments (message_id, status, review_reason, appointment_date, appointment_time, plate, brand, model,
         work_items, replacement, customer_name, subject, from_address)
       values ($1, 'review', 'plate_unknown', $2, '10:30', 'ZZ999Z', 'VOLKSWAGEN', 'POLO', '["Remmen nakijken"]'::jsonb, 'Geen',
         'Mevr. J. Bakker', 'Afspraak Aanvraag', 'noreply@garage.software')`,
      [`${PREFIX}2>`, weekday(8)],
    );
  });
  state.prepared = true;
}

async function openCalendar(page) {
  await prepare();
  await goto(page, "/maintenance");
  await closeDialogs(page);
  await settle(page);
}

async function openDialog(page) {
  await openCalendar(page);
  await page.getByTestId("button-online-appointments").click();
  const dlg = page.getByTestId("online-appointments-dialog");
  await dlg.waitFor();
  await settle(page);
  return dlg;
}

async function openSettingsEmail(page) {
  await goto(page, "/");
  await page.locator("header button").filter({ hasText: /admin/i }).first().click();
  await page.getByRole("button", { name: "App-instellingen" }).click();
  const settings = dialog(page);
  await settings.waitFor();
  await settle(page);
  await settings.getByRole("tab", { name: "E-mail & GPS" }).click();
  await settle(page);
  return settings;
}

export const steps = [
  {
    // Stap 1 in 7.10: de knop met het aantal.
    name: "07-online-afspraken-knop",
    async run(page) {
      await openCalendar(page);
      await shot(page, "07-online-afspraken-knop", {
        marks: [{ locator: page.getByTestId("button-online-appointments"), text: "Online afspraken" }],
      });
    },
  },
  {
    // Stap 2 in 7.10: de regel in de kalender met de stippellijn en het klokje.
    name: "07-online-afspraken-kalender",
    async run(page) {
      await openCalendar(page);
      // De afspraak ligt over een week; in de maandweergave staat hij soms in de volgende maand.
      const mark = page.getByTestId(`online-appointment-mark-scheduled_maintenance_${state.blockId}`);
      if (!(await mark.isVisible().catch(() => false))) {
        // De pijl naar de volgende maand heeft geen naam; hij staat direct rechts van de maandnaam.
        await page.locator("button:has(svg.lucide-chevron-right)").first().click().catch(() => {});
        await settle(page);
      }
      const event = page.getByTestId(`event-scheduled_maintenance_${state.blockId}-scheduled_maintenance`);
      await shot(page, "07-online-afspraken-kalender", {
        marks: [{ locator: event, text: "Te bevestigen" }],
      });
    },
  },
  {
    // Stap 3 en 4 in 7.10: het venster met de twee lijsten en de knoppen.
    name: "07-online-afspraken-venster",
    async run(page) {
      const dlg = await openDialog(page);
      await shot(page, "07-online-afspraken-venster", {
        clip: dlg,
        marks: [
          dlg.getByTestId(`appointment-confirm-${state.pendingId}`),
          dlg.getByTestId(`appointment-cancel-${state.pendingId}`),
          { locator: dlg.locator('[data-testid^="appointment-rental-"]').first(), text: "Reserveringsnummer" },
          dlg.locator('[data-testid^="appointment-link-"]').first(),
          dlg.locator('[data-testid^="appointment-dismiss-"]').first(),
        ],
      });
      await closeDialogs(page);
    },
  },
  {
    // Stap 5 in 7.10: de vraag bij annuleren. Er wordt niets geannuleerd.
    name: "07-online-afspraken-annuleren",
    async run(page) {
      const dlg = await openDialog(page);
      await dlg.getByTestId(`appointment-cancel-${state.pendingId}`).click();
      const ask = page.getByRole("alertdialog");
      await ask.waitFor();
      await shot(page, "07-online-afspraken-annuleren", {
        clip: ask,
        marks: [ask.getByRole("button", { name: "Behouden" }), ask.getByTestId("appointment-cancel-yes")],
      });
      await ask.getByRole("button", { name: "Behouden" }).click();
      await closeDialogs(page);
    },
  },
  {
    // 9.9 en 19.3: het veld met de afzenders van de garageplanner.
    name: "09-postvak-online-afspraken-afzenders",
    async run(page) {
      const settings = await openSettingsEmail(page);
      const field = settings.getByTestId("textarea-invoice-inbox-appointment-senders");
      await field.scrollIntoViewIfNeeded();
      await shot(page, "09-postvak-online-afspraken-afzenders", {
        clip: field.locator("xpath=.."),
        marks: [{ locator: field, text: "Afzenders garageplanner" }],
      });
      await closeDialogs(page);
    },
  },
  {
    // 19.3: het tabblad Online afspraken in het logboek.
    name: "19-logboek-online-afspraken",
    async run(page) {
      await prepare();
      const settings = await openSettingsEmail(page);
      await settings.getByTestId("button-invoice-inbox-log").click();
      const log = dialog(page, /Logboek/);
      await log.waitFor();
      await log.getByTestId("tab-invoice-inbox-log-appointments").click();
      await settle(page);
      await shot(page, "19-logboek-online-afspraken", {
        clip: log,
        marks: [log.getByTestId("tab-invoice-inbox-log-appointments"), log.getByTestId("link-online-appointments-log-calendar")],
      });
      await closeDialogs(page);
    },
  },
  {
    // Opruimen: de twee afspraken en de onderhoudsregel gaan weer weg.
    name: "online-afspraken-opruimen",
    async run() {
      await withDb(cleanup);
      Object.assign(state, { blockId: null, pendingId: null, prepared: false });
    },
  },
];
