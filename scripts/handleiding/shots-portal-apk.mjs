/**
 * Hoofdstuk 3 en 16: APK inplannen en Onderhoud melden in het klantenportaal, de online agenda van de
 * garage in de portaalinstellingen, en een aanvraag APK inplannen bij kantoor.
 *
 * De klantkant vraagt een portaalaccount en een lopende huur waarvan de APK binnenkort verloopt. Die
 * zijn er in de testdata niet, dus de eerste stap zet ze rechtstreeks in de testdatabase lvs_e2e
 * (zoals seed-extra.mjs): een portaalaccount bij de klant van een opgehaalde reservering, en een
 * APK-datum over 20 dagen op die auto. De laatste stap zet de APK-datum terug.
 *
 * De agenda zelf is een pagina van Garagesoftware (planner.garage.software). Die laadt alleen met
 * internet; zonder internet staat er een leeg vak, de rest van de foto klopt dan nog.
 */
import crypto from "node:crypto";
import pg from "pg";
import { BASE_URL, PASSWORD, closeDialogs, dialog, goto, settle, shot } from "./lib.mjs";

const DATABASE_URL = process.env.HANDLEIDING_DB || "postgresql://postgres:postgres@localhost:5432/lvs_e2e";
const PORTAL_EMAIL = "portaal-handleiding@voorbeeld.invalid";

/** Wat de stappen delen: de reservering, de klant en de oude APK-datum (om terug te zetten). */
const state = { reservationId: null, customerId: null, vehicleId: null, endDate: null, oldApkDate: undefined, prepared: false };

function ymd(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Zelfde vorm als hashPassword in server/auth.ts: <hash>.<salt>.s<N>.<r>.<p>. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const N = 1 << 16;
  const hash = crypto.scryptSync(password, salt, 64, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString("hex");
  return `${hash}.${salt}.s${N}.8.1`;
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

/** Een opgehaalde huur met nog minstens 10 dagen te gaan. Verandert niets. */
async function findRental() {
  if (state.reservationId) return;
  await withDb(async (db) => {
    const { rows } = await db.query(
      `select r.id, r.customer_id, r.vehicle_id, r.end_date, v.apk_date
         from reservations r join vehicles v on v.id = r.vehicle_id
        where r.status = 'picked_up' and r.type = 'standard' and r.deleted_at is null and r.replacement_for_reservation_id is null
          and (r.end_date is null or r.end_date >= $1)
        order by r.end_date nulls first limit 1`,
      [ymd(10)],
    );
    if (!rows.length) throw new Error("Geen opgehaalde huur met nog minstens 10 dagen te gaan in de testdata.");
    const r = rows[0];
    Object.assign(state, { reservationId: r.id, customerId: r.customer_id, vehicleId: r.vehicle_id, endDate: r.end_date, oldApkDate: r.apk_date });
  });
}

/** Een portaalaccount bij de klant van die huur, en een APK-datum die binnen de huur verloopt. */
async function prepare() {
  await findRental();
  if (state.prepared) return;
  await withDb(async (db) => {
    const r = { customer_id: state.customerId };
    // De APK verloopt over 20 dagen, en altijd vóór het einde van de huur.
    const apk = state.endDate && state.endDate < ymd(20) ? ymd(9) : ymd(20);
    await db.query("update vehicles set apk_date = $1 where id = $2", [apk, state.vehicleId]);

    await db.query(
      `insert into portal_customer_settings (customer_id, portal_enabled, can_submit_requests) values ($1, true, true)
       on conflict (customer_id) do update set portal_enabled = true, can_submit_requests = true`,
      [r.customer_id],
    );
    const hash = hashPassword(PASSWORD);
    const existing = await db.query("select id from portal_users where lower(email) = $1", [PORTAL_EMAIL]);
    if (existing.rows.length) {
      await db.query("update portal_users set customer_id = $1, password_hash = $2, active = true, role = 'admin' where id = $3", [r.customer_id, hash, existing.rows[0].id]);
    } else {
      await db.query(
        `insert into portal_users (customer_id, email, password_hash, full_name, role, active, created_by) values ($1, $2, $3, 'Petra de Vries', 'admin', true, 'handleiding')`,
        [r.customer_id, PORTAL_EMAIL, hash],
      );
    }
  });
  state.prepared = true;
}

/** Inloggen in het portaal (eigen inlog, los van de medewerker) en de reservering openen. */
async function openPortalReservation(page) {
  await prepare();
  await page.goto(`${BASE_URL}/portaal/login`);
  await settle(page);
  if (await page.locator("#portal-email").isVisible().catch(() => false)) {
    await page.locator("#portal-email").fill(PORTAL_EMAIL);
    await page.locator("#portal-password").fill(PASSWORD);
    await page.getByTestId("portal-login-form").locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  }
  await page.goto(`${BASE_URL}/portaal/reserveringen/${state.reservationId}`);
  await settle(page);
  await page.getByTestId("apk-alert").waitFor();
  return dialog(page);
}

async function openChoice(page, button) {
  const reservation = await openPortalReservation(page);
  await reservation.getByTestId(button).click();
  const choice = page.getByTestId("portal-apk-dialog");
  await choice.waitFor();
  await settle(page);
  return choice;
}

export const steps = [
  {
    name: "03-portaal-apk-melding",
    async run(page) {
      // 1. In de reservering: de APK-melding met de knop APK inplannen.
      const reservation = await openPortalReservation(page);
      const alert = reservation.getByTestId("apk-alert");
      await shot(page, "03-portaal-apk-melding", { clip: reservation, marks: [{ locator: alert.getByTestId("button-apk-plan"), text: "APK inplannen" }] });
    },
  },
  {
    name: "03-portaal-apk-keuze",
    async run(page) {
      // 2. De keuze: zelf een aanvraag doen, of zelf een afspraak maken in de agenda van de garage.
      const choice = await openChoice(page, "button-apk-plan");
      await shot(page, "03-portaal-apk-keuze", {
        clip: choice,
        marks: [{ locator: choice.getByTestId("button-apk-request"), text: "Aanvraag doen" }, { locator: choice.getByTestId("button-apk-planner"), text: "Agenda openen" }],
      });
    },
  },
  {
    name: "03-portaal-apk-agenda",
    async run(page) {
      // 3. De agenda open: links wat de klant aanvinkt en het kenteken om over te nemen, rechts de agenda.
      await page.setViewportSize({ width: 1280, height: 1200 });
      const choice = await openChoice(page, "button-apk-plan");
      await choice.getByTestId("button-apk-planner").click();
      await choice.getByTestId("apk-planner-frame").waitFor();
      await page.waitForTimeout(4000); // de agenda is een pagina van buiten
      await shot(page, "03-portaal-apk-agenda", {
        clip: choice,
        marks: [
          { locator: choice.getByText("Vink in de agenda alleen APK aan."), text: "Alleen APK" },
          { locator: choice.getByTestId("apk-copy-plate"), text: "Kenteken kopiëren" },
          { locator: choice.getByTestId("apk-planner-frame"), text: "Agenda van de garage" },
        ],
      });
    },
  },
  {
    name: "03-portaal-apk-aanvraag",
    async run(page) {
      // 4. Aanvraag doen: het formulier met de auto al ingevuld en een voorkeursdag. Niet versturen.
      await page.setViewportSize({ width: 1280, height: 1100 });
      const choice = await openChoice(page, "button-apk-plan");
      await choice.getByTestId("button-apk-request").click();
      const form = page.getByTestId("portal-request-form");
      await form.waitFor();
      await settle(page);
      await shot(page, "03-portaal-apk-aanvraag", {
        clip: dialog(page),
        marks: [
          { locator: form.getByTestId("apk-info"), text: "Auto en APK-datum" },
          { locator: form.getByText("Voorkeursdag (mag leeg blijven)"), text: "Voorkeursdag" },
          { locator: form.getByTestId("button-submit-request"), text: "Versturen" },
        ],
      });
    },
  },
  {
    name: "03-portaal-onderhoud-keuze",
    async run(page) {
      // 5. Onderhoud melden opent dezelfde keuze, met de waarschuwing over vervangend vervoer bij de agenda.
      await page.setViewportSize({ width: 1280, height: 1200 });
      const choice = await openChoice(page, "button-request-maintenance");
      await shot(page, "03-portaal-onderhoud-keuze", {
        clip: choice,
        marks: [{ locator: choice.getByTestId("button-apk-request"), text: "Melding doen" }, { locator: choice.getByTestId("button-apk-planner"), text: "Agenda openen" }],
      });
      await choice.getByTestId("button-apk-planner").click();
      await choice.getByTestId("apk-planner-frame").waitFor();
      await page.waitForTimeout(4000);
      await shot(page, "03-portaal-onderhoud-agenda", { clip: choice, marks: [{ locator: choice.getByTestId("plan-self-note"), text: "Vervangend vervoer" }] });
    },
  },
  {
    name: "03-portaal-instellingen-agenda",
    async run(page) {
      // 6. Kantoor: het adres van de agenda in de instellingen van het portaal.
      await page.setViewportSize({ width: 1280, height: 1200 });
      await goto(page, "/");
      await page.locator("header button").filter({ hasText: /admin/i }).first().click();
      await page.getByRole("button", { name: "App-instellingen" }).click();
      const dlg = dialog(page);
      await dlg.waitFor();
      await dlg.getByRole("tab", { name: "Klantenportaal" }).click();
      await settle(page);
      const field = dlg.getByTestId("input-apk-planner-url");
      await field.scrollIntoViewIfNeeded();
      const block = field.locator("xpath=ancestor::div[contains(@class,'md:col-span-2')][1]");
      await shot(page, "03-portaal-instellingen-agenda", { clip: block, pad: 16, marks: [{ locator: field, text: "Online agenda van de garage" }] });
    },
  },
  {
    name: "16-aanvraag-apk",
    async run(page) {
      // 7. Kantoor: een aanvraag APK inplannen met de voorkeursdag en het standaardantwoord.
      await findRental();
      await withDb(async (db) => {
        const { rows } = await db.query("select count(*)::int as n from portal_requests where type = 'apk' and reservation_id = $1 and status in ('new','in_progress')", [state.reservationId]);
        if (rows[0].n === 0) {
          await db.query(
            `insert into portal_requests (customer_id, type, reservation_id, payload, message, status, created_at, updated_at)
             values ($1, 'apk', $2, $3, 'Graag de APK laten keuren. Liefst op een dinsdag.', 'new', now() - interval '3 hours', now() - interval '3 hours')`,
            [state.customerId, state.reservationId, JSON.stringify({ preferredDate: ymd(7) })],
          );
        }
      });
      await page.setViewportSize({ width: 1280, height: 1300 });
      await goto(page, "/portal-admin");
      await closeDialogs(page);
      await settle(page);
      await page.getByText(/^APK inplannen · /).first().click();
      const dlg = dialog(page, /Aanvraag #/);
      await dlg.waitFor();
      await settle(page);
      await dlg.getByRole("button", { name: "Ontvangen" }).click();
      await page.waitForTimeout(300);
      await shot(page, "16-aanvraag-apk", {
        clip: dlg,
        marks: [
          { locator: dlg.getByTestId("requested-apk-date"), text: "Voorkeursdag" },
          dlg.getByRole("button", { name: "Ontvangen" }),
          dlg.getByRole("textbox", { name: "Antwoord aan klant" }),
        ],
      });
    },
  },
  {
    name: "03-portaal-apk-opruimen",
    async run() {
      // De APK-datum van de auto terugzetten, zodat andere foto's niet veranderen.
      if (!state.prepared) return;
      await withDb((db) => db.query("update vehicles set apk_date = $1 where id = $2", [state.oldApkDate, state.vehicleId]));
      state.prepared = false;
    },
  },
];
