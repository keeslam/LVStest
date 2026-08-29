import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

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

// Namespaces mirror the domains in the app so each locale file stays small
// enough to review and edit without merge conflicts across pages.
export const defaultNS = "common";

i18n
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
      },
    },
    // Dutch is the primary audience for this app; English stays available
    // as a fallback so a missing key never renders blank.
    fallbackLng: "nl",
    lng: "nl",
    defaultNS,
    ns: [
      "common", "nav", "dashboard", "vehicles", "customers", "reservations",
      "expenses", "documents", "reports", "notifications", "settings",
      "auth", "maintenance", "delivery", "barcodes",
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
