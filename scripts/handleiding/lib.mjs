/**
 * Hulpfuncties voor de schermafbeeldingen van de gebruikershandleiding.
 *
 *   node scripts/handleiding/run.mjs [filter]
 *
 * Draait tegen de E2E-testomgeving (`npx tsx e2e/support/serve.ts`, poort 5010,
 * database lvs_e2e met de gezaaide accounts) of tegen een andere server via
 * HANDLEIDING_URL, HANDLEIDING_USER en HANDLEIDING_PASSWORD. Elke afbeelding
 * is 1280 px breed en komt in docs/gebruikershandleiding/afbeeldingen/.
 *
 * `shot()` kan knoppen en velden rood omlijnen (met een nummer) zodat de
 * lezer ziet waar hij moet klikken; de omlijning staat alleen op de foto.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const OUT_DIR = path.join(ROOT, "docs", "gebruikershandleiding", "afbeeldingen");

export const BASE_URL = process.env.HANDLEIDING_URL || "http://localhost:5010";
// De API-limiet is 1000 verzoeken per gebruiker per kwartier; met --account
// (run.mjs) of HANDLEIDING_USER wissel je van account: e2e-admin, e2e-admin-b,
// e2e-manager, e2e-manager-b.
export const USERNAME = process.env.HANDLEIDING_USER || "e2e-admin";
export const PASSWORD = process.env.HANDLEIDING_PASSWORD || process.env.E2E_PASSWORD || "E2e-Alleen-Lokaal-2026!";

export const VIEWPORT = { width: 1280, height: 900 };

export async function launch({ headless = true } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(90_000);
  return { browser, context, page };
}

export async function login(page, { username = USERNAME, password = PASSWORD } = {}) {
  await page.goto(`${BASE_URL}/auth`);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"));
  await settle(page);
}

/** Wacht tot de pagina rustig is: geen lopende verzoeken en geen laadrondjes. */
export async function settle(page, { timeout = 10_000 } = {}) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
  await page
    .locator(".animate-spin")
    .first()
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(250);
}

export async function goto(page, route) {
  await page.goto(`${BASE_URL}${route}`);
  await settle(page);
}

/** JSON-verzoek met de sessie en het CSRF-token van de ingelogde pagina. */
export async function api(page, method, url, body) {
  const cookies = await page.context().cookies(BASE_URL);
  const csrf = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
  const headers = { "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = decodeURIComponent(csrf);
  const response = await page.request.fetch(`${BASE_URL}${url}`, {
    method,
    headers,
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok()) {
    throw new Error(`${method} ${url} -> ${response.status()}: ${typeof json === "string" ? json.slice(0, 300) : JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

const OVERLAY_ATTR = "data-handleiding-overlay";

/**
 * Tekent een rode omlijning (met nummer) om elk element. `marks` is een lijst
 * van Playwright-locators of `{ locator, label }`.
 */
async function drawMarks(page, marks) {
  // Eerst alles in beeld scrollen (de laatste scroll telt), dan pas de posities
  // meten: de omlijning staat vast ten opzichte van het venster, dus een
  // positie die vóór een latere scroll is gemeten klopt niet meer.
  const targets = marks.map((mark) => {
    const isLocator = typeof mark.boundingBox === "function";
    const locator = isLocator ? mark : mark.locator;
    return {
      target: locator.first(),
      label: isLocator ? undefined : mark.label,
      pad: (isLocator ? undefined : mark.pad) ?? 4,
    };
  });
  for (const { target } of targets) await target.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);
  const viewport = page.viewportSize();
  const boxes = [];
  let number = 0;
  for (const [index, { target, label, pad }] of targets.entries()) {
    const box = await target.boundingBox();
    if (!box) throw new Error(`Markering ${index + 1} (${label ?? ""}): element niet zichtbaar`);
    const inside = box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width;
    if (!inside) {
      console.warn(`  ! markering ${index + 1} valt buiten beeld en is weggelaten`);
      continue;
    }
    number += 1;
    boxes.push({ ...box, label: label ?? String(number), pad });
  }
  await page.evaluate(
    ({ boxes, attr }) => {
      for (const box of boxes) {
        const el = document.createElement("div");
        el.setAttribute(attr, "");
        Object.assign(el.style, {
          position: "fixed",
          left: `${box.x - box.pad}px`,
          top: `${box.y - box.pad}px`,
          width: `${box.width + box.pad * 2}px`,
          height: `${box.height + box.pad * 2}px`,
          border: "3px solid #dc2626",
          borderRadius: "6px",
          boxShadow: "0 0 0 2px rgba(255,255,255,0.9)",
          pointerEvents: "none",
          zIndex: "2147483647",
          boxSizing: "border-box",
        });
        if (box.label) {
          const badge = document.createElement("span");
          badge.textContent = box.label;
          Object.assign(badge.style, {
            position: "absolute",
            left: "-14px",
            top: "-14px",
            minWidth: "26px",
            height: "26px",
            padding: "0 6px",
            borderRadius: "13px",
            background: "#dc2626",
            color: "#fff",
            font: "bold 15px/26px Arial, sans-serif",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
            boxSizing: "border-box",
          });
          el.appendChild(badge);
        }
        document.body.appendChild(el);
      }
    },
    { boxes, attr: OVERLAY_ATTR },
  );
}

async function clearMarks(page) {
  await page.evaluate((attr) => document.querySelectorAll(`[${attr}]`).forEach((el) => el.remove()), OVERLAY_ATTR);
}

/**
 * Maakt `afbeeldingen/<name>.png`.
 *  - `clip`: een locator; de foto wordt bijgesneden tot dat element (plus `pad`).
 *  - `marks`: elementen die rood omlijnd worden, genummerd in volgorde.
 *  - `fullPage`: de hele pagina in plaats van het venster.
 */
export async function shot(page, name, { clip, box, marks = [], fullPage = false, pad = 12 } = {}) {
  if (!/^[0-9]{2}-[a-z0-9-]+$/.test(name)) throw new Error(`Ongeldige bestandsnaam: ${name}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await settle(page);
  if (marks.length) await drawMarks(page, marks);
  const file = path.join(OUT_DIR, `${name}.png`);
  if (box) {
    const viewport = page.viewportSize();
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    await page.screenshot({
      path: file,
      clip: { x, y, width: Math.min(viewport.width - x, box.width), height: Math.min(viewport.height - y, box.height) },
    });
  } else if (clip) {
    const target = clip.first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const box = await target.boundingBox();
    if (!box) throw new Error(`${name}: element om bij te snijden niet zichtbaar`);
    const viewport = page.viewportSize();
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    const width = Math.min(viewport.width - x, box.width + pad * 2);
    const height = Math.min(viewport.height - y, box.height + pad * 2);
    await page.screenshot({ path: file, clip: { x, y, width, height } });
  } else {
    await page.screenshot({ path: file, fullPage });
  }
  if (marks.length) await clearMarks(page);
  console.log(`  ✓ ${name}.png`);
  return file;
}

/** Het open dialoogvenster (Radix). */
export function dialog(page, name) {
  return name ? page.getByRole("dialog", { name }) : page.getByRole("dialog").last();
}

export async function closeDialogs(page) {
  for (let i = 0; i < 4; i += 1) {
    const open = page.getByRole("dialog");
    if ((await open.count()) === 0) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // "Wijzigingen verwerpen?" bevestigen als die verschijnt.
    const discard = page.getByRole("button", { name: /^Verwerpen$/ });
    if (await discard.isVisible().catch(() => false)) await discard.click();
    await page.waitForTimeout(200);
  }
}

export function ymd(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
