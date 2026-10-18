/** Hoofdstuk 3 (Klanten): lijst, klantkaart, toevoegen, chauffeurs, portaal, verwijderen, blokkeren. */
import { api, dialog, goto, settle, shot } from "./lib.mjs";

const NEW_CUSTOMER = "Slagerij De Wit";

async function openCustomer(page, name) {
  await goto(page, "/customers");
  const search = page.getByRole("textbox", { name: "Klanten zoeken" });
  await search.fill(name);
  await page.waitForTimeout(600);
  await settle(page);
  await page.getByRole("button", { name: "Bekijken", exact: true }).first().click();
  const dlg = dialog(page, "Klantgegevens");
  await dlg.waitFor();
  await settle(page);
  return dlg;
}

async function openAddCustomer(page) {
  await goto(page, "/customers");
  await page.getByRole("button", { name: "Klant toevoegen" }).click();
  const dlg = dialog(page, "Nieuwe klant toevoegen");
  await dlg.waitFor();
  return dlg;
}

export const steps = [
  {
    name: "03-klanten-lijst-knoppen",
    async run(page) {
      await goto(page, "/customers");
      await shot(page, "03-klanten-lijst-knoppen", {
        marks: [
          page.getByRole("textbox", { name: "Klanten zoeken" }),
          page.getByRole("button", { name: "Filters" }),
          page.getByRole("button", { name: "Klant toevoegen" }),
          page.getByRole("button", { name: "Bekijken", exact: true }).first(),
          page.getByRole("button", { name: "Verwijderde klanten" }),
        ],
      });
    },
  },
  {
    name: "03-klantgegevens",
    async run(page) {
      const dlg = await openCustomer(page, "Bakkerij");
      await shot(page, "03-klantgegevens", {
        clip: dlg,
        marks: [dlg.getByRole("button", { name: "Bewerken" }), dlg.getByRole("button", { name: "Nieuwe reservering" }), dlg.getByRole("tablist")],
      });
    },
  },
  {
    name: "03-klant-toevoegen-basis",
    async run(page) {
      // Herhaalbaar: een eerder aangemaakte Slagerij De Wit eerst weghalen, anders komt er geen groene melding.
      const existing = (await api(page, "GET", "/api/customers")).filter((c) => c.name?.toLowerCase() === NEW_CUSTOMER.toLowerCase());
      for (const c of existing) await api(page, "DELETE", `/api/customers/${c.id}`).catch(() => {});
      // Een verwijderde klant houdt zijn debiteurnummer vast in de prullenbak; alleen in de
      // testdatabase: die prullenbakregel definitief weghalen, zodat 10027 weer vrij is.
      const bin = await api(page, "GET", "/api/deleted-records?type=customer").catch(() => []);
      const rows = Array.isArray(bin) ? bin : bin?.records ?? bin?.items ?? [];
      for (const row of rows.filter((r) => JSON.stringify(r).toLowerCase().includes(NEW_CUSTOMER.toLowerCase()))) {
        await api(page, "DELETE", `/api/deleted-records/${row.id}`).catch(() => {});
      }
      const debtorNumber = "10027";
      const dlg = await openAddCustomer(page);
      await dlg.getByRole("textbox", { name: "Volledige naam" }).fill(NEW_CUSTOMER);
      await dlg.getByRole("textbox", { name: "Debiteurnummer" }).fill(debtorNumber);
      await dlg.getByRole("textbox", { name: "Postcode" }).fill("3011 AD");
      await dlg.getByRole("textbox", { name: "Huisnummer" }).fill("4");
      await page.waitForTimeout(1500);
      await settle(page);
      await shot(page, "03-klant-toevoegen-basis", {
        clip: dlg,
        marks: [
          dlg.getByRole("combobox", { name: "Klanttype" }),
          dlg.getByRole("textbox", { name: "Volledige naam" }),
          dlg.getByRole("textbox", { name: "Postcode" }),
          dlg.getByRole("textbox", { name: "Huisnummer" }),
          dlg.getByRole("tab", { name: "Contact" }),
        ],
      });
      await dlg.getByRole("tab", { name: "Contact" }).click();
      await dlg.getByRole("textbox", { name: "Primair e-mailadres" }).fill("info@slagerijdewit.example");
      await dlg.getByRole("textbox", { name: "Primair telefoonnummer" }).fill("+31 10 2345678");
      await shot(page, "03-klant-toevoegen-contact", {
        clip: dlg,
        marks: [dlg.getByRole("textbox", { name: "Primair e-mailadres" }), dlg.getByRole("textbox", { name: "Primair telefoonnummer" }), dlg.getByRole("tab", { name: "Bedrijf" })],
      });
      await dlg.getByRole("tab", { name: "Bedrijf" }).click();
      await dlg.getByRole("textbox", { name: "Bedrijfsnaam" }).fill(NEW_CUSTOMER);
      await dlg.getByRole("textbox", { name: "Contactpersoon" }).fill("Henk de Wit");
      await dlg.getByRole("textbox", { name: /Kamer van Koophandel/ }).fill("24345678");
      await shot(page, "03-klant-toevoegen-bedrijf", {
        clip: dlg,
        marks: [dlg.getByRole("textbox", { name: "Bedrijfsnaam" }), dlg.getByRole("textbox", { name: /Kamer van Koophandel/ }), dlg.getByRole("button", { name: "Klant toevoegen" })],
      });
      await dlg.getByRole("button", { name: "Klant toevoegen" }).click();
      // De groene melding verdwijnt na een paar seconden: meteen vastleggen, niet eerst wachten tot de pagina stil is.
      // De tekst staat ook in een onzichtbare voorleesregel; alleen de zichtbare melding markeren.
      const toast = page.getByText("Klant succesvol aangemaakt", { exact: true }).locator("visible=true").first();
      await toast.waitFor({ timeout: 10_000 });
      // De melding schuift linksonder in beeld; even wachten tot hij stilstaat.
      await page.waitForTimeout(450);
      const card = toast.locator("xpath=ancestor::li[1]");
      await shot(page, "03-klant-aangemaakt", { box: { x: 0, y: 640, width: 640, height: 260 }, marks: [{ locator: card, text: "Melding" }] });
      await settle(page);
    },
  },
  {
    name: "03-bestaat-mogelijk-al",
    async run(page) {
      const dlg = await openAddCustomer(page);
      await dlg.getByRole("textbox", { name: "Volledige naam" }).fill("Marloes van Dijk");
      await dlg.getByRole("tab", { name: "Contact" }).click();
      await dlg.getByRole("textbox", { name: "Primair e-mailadres" }).fill("info@bakkerijvandijk.example");
      await page.waitForTimeout(1500);
      await settle(page);
      await shot(page, "03-bestaat-mogelijk-al", { clip: dlg, marks: [dlg.getByRole("button", { name: "Openen" })] });
    },
  },
  {
    name: "03-klant-bewerken",
    async run(page) {
      const dlg = await openCustomer(page, "Bakkerij");
      await dlg.getByRole("button", { name: "Bewerken" }).click();
      const edit = dialog(page, "Klant bewerken");
      await edit.waitFor();
      // Het venster is hoger dan 900 px; anders vallen de tabbladen buiten beeld.
      await page.setViewportSize({ width: 1280, height: 1400 });
      await shot(page, "03-klant-bewerken", { clip: edit, marks: [edit.getByRole("tablist"), edit.getByRole("button", { name: "Klant bijwerken" })] });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "03-chauffeurs",
    async run(page) {
      const dlg = await openCustomer(page, "Bakkerij");
      await dlg.getByRole("tab", { name: "Chauffeurs" }).click();
      await settle(page);
      await shot(page, "03-chauffeurs", {
        clip: dlg,
        marks: [dlg.getByRole("tab", { name: "Chauffeurs" }), dlg.getByRole("button", { name: "Chauffeur toevoegen" }), dlg.getByRole("button", { name: "Verwijderde chauffeurs" })],
      });
      await dlg.getByRole("button", { name: "Chauffeur toevoegen" }).click();
      const add = dialog(page, "Chauffeur toevoegen");
      await add.waitFor();
      await add.getByRole("textbox", { name: /Weergavenaam/ }).fill("Fatima Yilmaz");
      // Het venster is hoger dan 900 px; anders valt Weergavenaam buiten beeld.
      await page.setViewportSize({ width: 1280, height: 1400 });
      await shot(page, "03-chauffeur-toevoegen", {
        clip: add,
        marks: [add.getByRole("textbox", { name: /Weergavenaam/ }), add.getByRole("button", { name: "Chauffeur toevoegen" })],
      });
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  },
  {
    name: "03-portaal-tabblad",
    async run(page) {
      const dlg = await openCustomer(page, "Bakkerij");
      await dlg.getByRole("tab", { name: "Portaal" }).click();
      await settle(page);
      await shot(page, "03-portaal-tabblad", {
        clip: dlg,
        marks: [dlg.getByRole("tab", { name: "Portaal" }), dlg.getByRole("button", { name: "Uitnodigen" })],
      });
      await dlg.getByRole("switch", { name: "Ziet prijzen" }).scrollIntoViewIfNeeded();
      await shot(page, "03-portaal-instellingen", {
        clip: dlg,
        marks: [dlg.getByRole("switch", { name: "Portaal actief" }), dlg.getByRole("switch", { name: "Ziet prijzen" })],
      });
      await dlg.getByRole("button", { name: "Uitnodigen" }).click();
      const invite = dialog(page, "Portaalaccount");
      await invite.waitFor();
      await shot(page, "03-portaalaccount-uitnodigen", {
        clip: invite,
        marks: [invite.getByRole("textbox", { name: /E-mailadres/ }).first(), invite.getByRole("button", { name: "Uitnodigen" }).last()],
      });
    },
  },
  {
    name: "03-geblokkeerde-voertuigen",
    async run(page) {
      const dlg = await openCustomer(page, "Garage Visser");
      await dlg.getByRole("button", { name: "Voertuig blokkeren" }).scrollIntoViewIfNeeded();
      await shot(page, "03-geblokkeerde-voertuigen", {
        clip: dlg,
        marks: [dlg.getByRole("button", { name: "Voertuig blokkeren" }), dlg.getByRole("button", { name: "Blokkade opheffen" }).first()],
      });
      await dlg.getByRole("button", { name: "Voertuig blokkeren" }).click();
      const block = dialog(page, "Voertuig blokkeren voor deze klant");
      await block.waitFor();
      await block.getByRole("button", { name: "Voertuig" }).click();
      const search = page.getByPlaceholder("Zoek op kenteken, merk of model...").last();
      await search.fill("Master");
      await page.waitForTimeout(500);
      await page.getByText("78-MST-9").last().click();
      await block.getByRole("textbox", { name: /Reden/ }).fill("Te hoog voor de garagedeur van deze klant");
      await shot(page, "03-voertuig-blokkeren", {
        clip: block,
        marks: [{ locator: block.getByRole("button", { name: "Voertuig" }), text: "Voertuig" }, block.getByRole("textbox", { name: /Reden/ }), block.getByRole("button", { name: "Blokkeren", exact: true })],
      });
      await block.getByRole("button", { name: "Annuleren" }).click();
      await page.waitForTimeout(400);
      await dlg.getByRole("button", { name: "Blokkade opheffen" }).first().click();
      const confirm = page.getByRole("alertdialog").last();
      await confirm.waitFor();
      await shot(page, "03-blokkade-opheffen", { clip: confirm, marks: [confirm.getByRole("button", { name: "Blokkade opheffen" })] });
    },
  },
  {
    name: "03-klant-verwijderen",
    async run(page) {
      await goto(page, "/customers");
      await page.getByRole("textbox", { name: "Klanten zoeken" }).fill(NEW_CUSTOMER);
      await page.waitForTimeout(600);
      await settle(page);
      await page.getByRole("button", { name: "Verwijderen", exact: true }).first().click();
      const dlg = page.locator('[role="dialog"], [role="alertdialog"]').last();
      await dlg.waitFor();
      await settle(page);
      await dlg.getByRole("textbox").first().fill(NEW_CUSTOMER);
      await shot(page, "03-klant-verwijderen", { clip: dlg, marks: [dlg.getByRole("textbox").first(), dlg.getByRole("button", { name: "Klant verwijderen" })] });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      // Een lege prullenbak zegt weinig: zet er een testklant in (zonder reserveringen).
      const old = "Verhuisbedrijf Oud";
      const bin0 = await api(page, "GET", "/api/deleted-records?type=customer").catch(() => []);
      const rows0 = Array.isArray(bin0) ? bin0 : bin0?.records ?? bin0?.items ?? [];
      if (!rows0.some((r) => JSON.stringify(r).includes(old))) {
        const made = await api(page, "POST", "/api/customers", { name: old, customerType: "business", companyName: old, city: "Schiedam" });
        await api(page, "DELETE", `/api/customers/${made.id ?? made.customer?.id}`);
        await page.reload();
        await settle(page);
      }
      await page.getByRole("button", { name: "Verwijderde klanten" }).click();
      const bin = dialog(page);
      await bin.waitFor();
      await settle(page);
      await shot(page, "03-verwijderde-klanten", {
        clip: bin,
        marks: [bin.getByRole("button", { name: "Terugzetten" }).first(), bin.getByRole("button", { name: /Definitief verwijderen/ }).first()],
      });
    },
  },
];
