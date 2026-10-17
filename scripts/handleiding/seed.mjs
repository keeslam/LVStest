/**
 * Vult de E2E-testomgeving met nette, verzonnen gegevens voor de
 * schermafbeeldingen: de acht gezaaide voertuigen en zes klanten krijgen een
 * gewone naam en een gewoon kenteken, en er komen chauffeurs, kosten, extra
 * reserveringen, een transport en een blokkade bij. Alles via de API van de
 * app zelf, als beheerder. Alleen bedoeld voor lvs_e2e; de kentekens en namen
 * bestaan niet.
 */
import { api, launch, login, ymd } from "./lib.mjs";

export const VEHICLES = [
  { licensePlate: "12-VKL-3", brand: "Volkswagen", model: "Crafter", vehicleType: "Van", dailyPrice: "85", currentMileage: 45000, apkDate: ymd(120) },
  { licensePlate: "34-SPR-5", brand: "Mercedes-Benz", model: "Sprinter", vehicleType: "Van", dailyPrice: "95", currentMileage: 82000, apkDate: ymd(200) },
  { licensePlate: "56-TRN-7", brand: "Ford", model: "Transit", vehicleType: "Van", dailyPrice: "80", currentMileage: 61000, apkDate: ymd(300) },
  { licensePlate: "78-MST-9", brand: "Renault", model: "Master", vehicleType: "Van", dailyPrice: "90", currentMileage: 120500, apkDate: ymd(40) },
  { licensePlate: "90-VVR-1", brand: "Opel", model: "Vivaro", vehicleType: "Van", dailyPrice: "75", currentMileage: 30100, apkDate: ymd(250) },
  { licensePlate: "21-BXR-4", brand: "Peugeot", model: "Boxer", vehicleType: "Van", dailyPrice: "85", currentMileage: 99000, apkDate: ymd(20) },
  { licensePlate: "43-DCT-6", brand: "Fiat", model: "Ducato", vehicleType: "Van", dailyPrice: "85", currentMileage: 15000, apkDate: ymd(-5), warrantyEndDate: ymd(25) },
  { licensePlate: "65-PRC-8", brand: "Toyota", model: "Proace", vehicleType: "Van", dailyPrice: "80", currentMileage: 5000, apkDate: ymd(400) },
];

export const CUSTOMERS = [
  { name: "Bakkerij Van Dijk B.V.", companyName: "Bakkerij Van Dijk B.V.", contactPerson: "Marloes van Dijk", debtorNumber: "10021", email: "info@bakkerijvandijk.example", phone: "+31 10 1234567", streetName: "Molenstraat", address: "Molenstraat 12", postalCode: "3011 AB", city: "Rotterdam", chamberOfCommerceNumber: "24123456", customerType: "business" },
  { name: "Installatiebedrijf Jansen", companyName: "Installatiebedrijf Jansen", contactPerson: "Peter Jansen", debtorNumber: "10022", email: "planning@jansen-installatie.example", phone: "+31 181 234567", streetName: "Industrieweg", address: "Industrieweg 8", postalCode: "3208 KA", city: "Spijkenisse", chamberOfCommerceNumber: "24234567", customerType: "business" },
  { name: "Pieter Bakker", firstName: "Pieter", lastName: "Bakker", debtorNumber: "10023", email: "p.bakker@mail.example", phone: "06-12345678", streetName: "Dorpsstraat", address: "Dorpsstraat 45", postalCode: "3214 AB", city: "Zuidland", customerType: "individual", driverLicenseNumber: "5123456789" },
  { name: "Sanne de Boer", firstName: "Sanne", lastName: "de Boer", debtorNumber: "10024", email: "sanne.deboer@mail.example", phone: "06-23456789", streetName: "Kerklaan", address: "Kerklaan 3", postalCode: "3171 AA", city: "Poortugaal", customerType: "individual" },
  { name: "Garage Visser", companyName: "Garage Visser", contactPerson: "Kees Visser", debtorNumber: "10025", email: "werkplaats@garagevisser.example", phone: "+31 180 345678", streetName: "Stationsweg", address: "Stationsweg 101", postalCode: "2991 AE", city: "Barendrecht", customerType: "business" },
  { name: "Hoveniersbedrijf Groen", companyName: "Hoveniersbedrijf Groen", contactPerson: "Anja Groen", debtorNumber: "10026", email: "anja@hoveniersgroen.example", phone: "06-34567890", streetName: "Lindelaan", address: "Lindelaan 77", postalCode: "3181 CD", city: "Rozenburg", customerType: "business" },
];

async function main() {
  const { browser, page } = await launch();
  try {
    await login(page);
    const vehicles = (await api(page, "GET", "/api/vehicles")).sort((a, b) => a.id - b.id);
    const customers = (await api(page, "GET", "/api/customers")).sort((a, b) => a.id - b.id);
    console.log(`${vehicles.length} voertuigen, ${customers.length} klanten gevonden`);

    for (const [index, data] of VEHICLES.entries()) {
      const vehicle = vehicles[index];
      if (!vehicle) break;
      await api(page, "PATCH", `/api/vehicles/${vehicle.id}`, {
        ...data,
        fuel: "diesel",
        registeredTo: "opnaam",
        company: "Auto Lease LAM",
        currentFuelLevel: ["full", "3/4", "1/2", "full", "1/4", "full", "3/4", "full"][index],
        remarks: index === 0 ? "Schuifdeur rechts klemt soms; even stevig dichttrekken." : undefined,
      });
      console.log(`  voertuig ${vehicle.licensePlate} -> ${data.licensePlate}`);
    }

    for (const [index, data] of CUSTOMERS.entries()) {
      const customer = customers[index];
      if (!customer) break;
      await api(page, "PATCH", `/api/customers/${customer.id}`, { ...data, country: "Nederland" });
      console.log(`  klant ${customer.name} -> ${data.name}`);
    }

    // Chauffeurs bij de eerste twee bedrijven.
    const existingDrivers = await api(page, "GET", "/api/drivers");
    if (existingDrivers.length === 0) {
      await api(page, "POST", `/api/customers/${customers[0].id}/drivers`, {
        displayName: "Marloes van Dijk", firstName: "Marloes", lastName: "van Dijk", email: "m.vandijk@bakkerijvandijk.example",
        phone: "06-45678901", driverLicenseNumber: "5234567890", licenseExpiry: ymd(700), isPrimaryDriver: true, status: "active",
      });
      await api(page, "POST", `/api/customers/${customers[0].id}/drivers`, {
        displayName: "Tom van Dijk", firstName: "Tom", lastName: "van Dijk", phone: "06-56789012",
        driverLicenseNumber: "5345678901", licenseExpiry: ymd(30), isPrimaryDriver: false, status: "active",
      });
      await api(page, "POST", `/api/customers/${customers[1].id}/drivers`, {
        displayName: "Peter Jansen", firstName: "Peter", lastName: "Jansen", phone: "06-67890123",
        driverLicenseNumber: "5456789012", isPrimaryDriver: true, status: "active",
      });
      console.log("  3 chauffeurs toegevoegd");
    }

    // Kosten op een paar auto's.
    const existingExpenses = await api(page, "GET", "/api/expenses");
    if (existingExpenses.length < 8) {
      const rows = [
        [0, "maintenance", "412.50", -40, "Grote beurt 45.000 km"],
        [0, "fuel", "88.20", -12, "Tankbeurt Shell Rotterdam"],
        [1, "tires", "640.00", -25, "Vier nieuwe banden"],
        [1, "toll", "23.40", -8, "Westerscheldetunnel"],
        [2, "cleaning", "45.00", -3, "Wasstraat en interieur"],
        [3, "brakes", "298.75", -15, "Remblokken voor"],
        [5, "insurance", "129.00", -30, "Premie oktober"],
        [6, "parking", "12.50", -2, "Parkeren Erasmus MC"],
        [7, "damage", "350.00", -20, "Krasje bumper hersteld"],
      ];
      for (const [v, category, amount, offset, description] of rows) {
        await api(page, "POST", "/api/expenses", { vehicleId: vehicles[v].id, category, amount, date: ymd(offset), description });
      }
      console.log(`  ${rows.length} kostenposten toegevoegd`);
    }

    // Extra reserveringen voor een gevulde kalender.
    const reservations = await api(page, "GET", "/api/reservations");
    if (reservations.length < 10) {
      const extra = [
        [7, 1, 5, 8], [0, 2, 15, 18], [5, 3, 22, 24], [1, 5, 12, 14],
      ];
      for (const [v, c, from, to] of extra) {
        await api(page, "POST", "/api/reservations", {
          vehicleId: vehicles[v].id, customerId: customers[c].id, startDate: ymd(from), endDate: ymd(to), status: "booked", type: "standard",
          totalPrice: String((to - from) * Number(VEHICLES[v].dailyPrice)),
        });
      }
      console.log(`  ${extra.length} reserveringen toegevoegd`);
    }

    // Een achterstallige huur (opgehaald, einddatum voorbij) en een nooit opgehaalde boeking van
    // ruim een maand geleden, voor de knoppen "… achterstallig" en "… niet opgehaald".
    const all = await api(page, "GET", "/api/reservations");
    if (!all.some((r) => r.notes === "handleiding:achterstallig")) {
      const overdue = await api(page, "POST", "/api/reservations", {
        vehicleId: vehicles[7].id, customerId: customers[5].id, startDate: ymd(-6), endDate: ymd(-2), status: "booked", type: "standard",
        totalPrice: "320", notes: "handleiding:achterstallig",
      });
      const id = overdue.id ?? overdue.reservation?.id;
      await api(page, "POST", `/api/reservations/${id}/pickup`, {
        contractNumber: "2026-0412", pickupMileage: 5100, fuelLevelPickup: "full", pickupDate: ymd(-6),
      }).catch((error) => console.log("  ophalen achterstallige huur:", error.message.slice(0, 160)));
      console.log("  achterstallige huur toegevoegd");
    }
    if (!all.some((r) => r.notes === "handleiding:niet-opgehaald")) {
      await api(page, "POST", "/api/reservations", {
        vehicleId: vehicles[2].id, customerId: customers[3].id, startDate: ymd(-45), endDate: ymd(-42), status: "booked", type: "standard",
        totalPrice: "240", notes: "handleiding:niet-opgehaald",
      });
      console.log("  nooit opgehaalde boeking toegevoegd");
    }

    // Een gepland transport.
    const transports = await api(page, "GET", "/api/transports");
    if (transports.length === 0) {
      await api(page, "POST", "/api/transports", {
        vehicleId: vehicles[4].id, transportType: "delivery", status: "scheduled", scheduledDate: ymd(2),
        originAddress: "Molenstraat 12", originCity: "Rotterdam", destinationAddress: "Industrieweg 8", destinationCity: "Spijkenisse",
        distanceKm: "24", tollCost: "3.60", driverName: "Jan", customerId: customers[1].id, billable: true, billableAmount: "125",
        notes: "Bus brengen voor de verbouwing",
      });
      console.log("  1 transport toegevoegd");
    }

    // Sleutellabels: elke auto een barcode, anders staan de afdrukknoppen grijs.
    for (const vehicle of vehicles) {
      if (!vehicle.barcode) await api(page, "POST", `/api/vehicles/${vehicle.id}/barcode/regenerate`, {});
    }

    // Een wegwerp-auto voor het venster "Voertuig verwijderen" en de prullenbak.
    if (!vehicles.some((v) => v.licensePlate === "77-TMP-7")) {
      await api(page, "POST", "/api/vehicles", {
        licensePlate: "77-TMP-7", brand: "Citroën", model: "Jumpy", vehicleType: "Van", fuel: "diesel", currentMileage: 72000,
        apkDate: ymd(150), availabilityStatus: "available", registeredTo: "opnaam", company: "Auto Lease LAM",
      });
      console.log("  wegwerp-auto 77-TMP-7 toegevoegd");
    }

    // Een blokkade: Garage Visser mag de Sprinter niet huren.
    const blacklist = await api(page, "GET", `/api/vehicles/${vehicles[1].id}/blacklist`).catch(() => []);
    if (!blacklist.length) {
      await api(page, "POST", `/api/vehicles/${vehicles[1].id}/blacklist`, { customerId: customers[4].id, reason: "Schade bij vorige verhuur niet gemeld" });
      console.log("  1 blokkade toegevoegd");
    }
    console.log("Klaar.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
