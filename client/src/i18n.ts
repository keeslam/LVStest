import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import type { BackendModule, ReadCallback } from "i18next";
import { SUPPORTED_LANGUAGES } from "@shared/languages";

import commonNl from "./locales/nl/common.json";
import navNl from "./locales/nl/nav.json";
import dashboardNl from "./locales/nl/dashboard.json";
import vehiclesNl from "./locales/nl/vehicles.json";
import customersNl from "./locales/nl/customers.json";
import reservationsNl from "./locales/nl/reservations.json";
import expensesNl from "./locales/nl/expenses.json";
import documentsNl from "./locales/nl/documents.json";
import reportsNl from "./locales/nl/reports.json";
import notificationsNl from "./locales/nl/notifications.json";
import settingsNl from "./locales/nl/settings.json";
import authNl from "./locales/nl/auth.json";
import maintenanceNl from "./locales/nl/maintenance.json";
import deliveryNl from "./locales/nl/delivery.json";
import barcodesNl from "./locales/nl/barcodes.json";
import portalNl from "./locales/nl/portal.json";
import fiscalNl from "./locales/nl/fiscal.json";
import recycleBinNl from "./locales/nl/recycleBin.json";
import leaseQuotesNl from "./locales/nl/leaseQuotes.json";

import commonEn from "./locales/en/common.json";
import navEn from "./locales/en/nav.json";
import dashboardEn from "./locales/en/dashboard.json";
import vehiclesEn from "./locales/en/vehicles.json";
import customersEn from "./locales/en/customers.json";
import reservationsEn from "./locales/en/reservations.json";
import expensesEn from "./locales/en/expenses.json";
import documentsEn from "./locales/en/documents.json";
import reportsEn from "./locales/en/reports.json";
import notificationsEn from "./locales/en/notifications.json";
import settingsEn from "./locales/en/settings.json";
import authEn from "./locales/en/auth.json";
import maintenanceEn from "./locales/en/maintenance.json";
import deliveryEn from "./locales/en/delivery.json";
import barcodesEn from "./locales/en/barcodes.json";
import portalEn from "./locales/en/portal.json";
import fiscalEn from "./locales/en/fiscal.json";
import recycleBinEn from "./locales/en/recycleBin.json";
import leaseQuotesEn from "./locales/en/leaseQuotes.json";

// Namespaces mirror the domains in the app so each locale file stays small
// enough to review and edit without merge conflicts across pages.
export const defaultNS = "common";

// Dutch and English are bundled, so the app (and every test) has them at once. The other
// languages are separate chunks, fetched the first time somebody switches to one; a
// language is loaded whole, all namespaces in one go.
const lazyLocaleFiles = import.meta.glob<{ default: Record<string, unknown> }>([
  "./locales/*/*.json",
  "!./locales/nl/*.json",
  "!./locales/en/*.json",
]);
const lazyLanguageLoads = new Map<string, Promise<Map<string, Record<string, unknown>>>>();

function loadLazyLanguage(lng: string): Promise<Map<string, Record<string, unknown>>> {
  let load = lazyLanguageLoads.get(lng);
  if (!load) {
    const prefix = `./locales/${lng}/`;
    const files = Object.entries(lazyLocaleFiles).filter(([path]) => path.startsWith(prefix));
    load = Promise.all(files.map(async ([path, importFile]) => [path.slice(prefix.length, -".json".length), (await importFile()).default] as const))
      .then((entries) => new Map(entries));
    // A failed fetch (offline, a new deploy) may be retried on the next switch.
    load.catch(() => lazyLanguageLoads.delete(lng));
    lazyLanguageLoads.set(lng, load);
  }
  return load;
}

const lazyLocaleBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language: string, namespace: string, callback: ReadCallback) {
    loadLazyLanguage(language)
      .then((namespaces) => callback(null, namespaces.get(namespace) ?? {}))
      .catch((error) => callback(error, false));
  },
};

i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      nl: {
        common: commonNl,
        nav: navNl,
        dashboard: dashboardNl,
        vehicles: vehiclesNl,
        customers: customersNl,
        reservations: reservationsNl,
        expenses: expensesNl,
        documents: documentsNl,
        reports: reportsNl,
        notifications: notificationsNl,
        settings: settingsNl,
        auth: authNl,
        maintenance: maintenanceNl,
        delivery: deliveryNl,
        barcodes: barcodesNl,
        portal: portalNl,
        fiscal: fiscalNl,
        recycleBin: recycleBinNl,
        leaseQuotes: leaseQuotesNl,
      },
      en: {
        common: commonEn,
        nav: navEn,
        dashboard: dashboardEn,
        vehicles: vehiclesEn,
        customers: customersEn,
        reservations: reservationsEn,
        expenses: expensesEn,
        documents: documentsEn,
        reports: reportsEn,
        notifications: notificationsEn,
        settings: settingsEn,
        auth: authEn,
        maintenance: maintenanceEn,
        delivery: deliveryEn,
        barcodes: barcodesEn,
        portal: portalEn,
        fiscal: fiscalEn,
        recycleBin: recycleBinEn,
        leaseQuotes: leaseQuotesEn,
      },
    },
    // Only nl and en come from `resources`; the backend above fetches the rest.
    partialBundledLanguages: true,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    // "es-ES" or "pt-BR" is read as the language alone.
    load: "languageOnly",
    // Dutch is the primary audience for this app; a key a translation lacks
    // falls back to Dutch, so it never renders blank.
    fallbackLng: "nl",
    lng: "nl",
    defaultNS,
    ns: [
      "common", "nav", "dashboard", "vehicles", "customers", "reservations",
      "expenses", "documents", "reports", "notifications", "settings",
      "auth", "maintenance", "delivery", "barcodes", "portal", "fiscal", "recycleBin", "leaseQuotes",
    ],
    interpolation: {
      escapeValue: false, // React already escapes output
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "language",
    },
  });

export default i18n;
