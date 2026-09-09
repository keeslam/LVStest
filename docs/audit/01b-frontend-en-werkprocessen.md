# Fase 1b — Staff-frontend, rollen en werkprocessen (leesonderzoek)

2026-09-09, commit 3e28645e. Bron: `client/src`. Klantenportaal apart (fase 1d/eigen spec).

## Routes en navigatie

`client/src/App.tsx:48-77`: alle staffroutes binnen één `MainLayout`; `ProtectedRoute` (`components/protected-route.tsx:11`) controleert alleen login, geen permissie per route. Sidebar (`components/sidebar-nav.tsx:21-41`) verbergt items op permissie (admin ziet alles):

| Route | Pagina | Sidebar-permissie |
|---|---|---|
| `/` | dashboard | VIEW_DASHBOARD |
| `/vehicles`, `/scan` | voertuigen, scannen | VIEW/MANAGE_VEHICLES |
| `/customers` | klanten | VIEW/MANAGE_CUSTOMERS |
| `/portal-admin` | Klantenportaal (badge ongelezen, 5 min poll) | VIEW/MANAGE_PORTAL |
| `/reservations`, `/reservations/edit/:id` | reserveringskalender, bewerken | VIEW/MANAGE_RESERVATIONS |
| `/maintenance` | onderhoudskalender | MANAGE_MAINTENANCE |
| `/expenses`, `/expenses/add` | kosten | MANAGE_EXPENSES |
| `/documents` | documenten + sjablooneditors | MANAGE_DOCUMENTS |
| `/delivery` | transporten | VIEW/MANAGE_RESERVATIONS |
| `/communications` | bulkmail + mailsjablonen | MANAGE_EMAIL_TEMPLATES/NOTIFICATIONS |
| `/reports` | rapporten | VIEW/MANAGE_REPORTS |
| `/auth` | login | publiek |
| `/portaal` | klantenportaal (eigen realm) | – |

Instellingen, Gebruikers, Backup, Profiel zijn dialogen uit het avatar-menu (`components/user-menu.tsx:130-160`), alleen zichtbaar voor rol admin (client-side). Topbalk: globale zoekfunctie (voertuig/klant/reservering, min 2 tekens), `PortalAlertChip`, `NotificationCenter`.

## Pagina's (samenvatting)

| Pagina | Data | Filter/paginering | Opmerking |
|---|---|---|---|
| `pages/vehicles/index.tsx` (868 r.) | `/api/vehicles` + `/api/reservations` volledig | client-side (zoek 300 ms debounce, sort, feature-filters, DataTable 10–50) | viewdialoog achter "opmerkingen"-tussenscherm |
| `pages/customers/index.tsx` (488 r.) | customers, reservations, drivers volledig | client-side; verrijking per render | |
| `pages/reservations/calendar.tsx` (4244 r.) | `/api/reservations/range` én volledig `/api/reservations` (`:608-676`), overdue, vehicles, transports | kalender server-ranged; "afgerond"-lijst en lookups client-side | grootste bestand; tabel twee keer geladen |
| `pages/maintenance/calendar.tsx` (2263 r.) | apk-/warranty-/service-due endpoints + ranged + volledig reservations (`:379-423`) | idem | complete-maintenance patcht inline (`:2074-2090`) |
| `pages/documents/index.tsx` (2207 r.) | documents, vehicles, alle sjabloontabellen | tabs: bibliotheek, contract-, transport-, label-, schadesjablonen | |
| `pages/reports/index.tsx` (2564 r.) | per tab | report-builder en maintenance-costs als pagina in dialoog (`:2520-2560`) | |
| `pages/delivery/dashboard.tsx` (1081 r.) | reservations, customers, vehicles, transports volledig | zoek + status client-side; **bulk print/afronden via checkboxes** (`:219-351`) | print via apart venster (`:360-369`) |
| `pages/CustomerCommunications.tsx` (2219 r.) | vehicles, customers, history, templates | | tweede sjabloonbeheer naast Instellingen |
| `pages/scan/index.tsx` + `barcodes/scan-dialog.tsx` | `ScanPanel` | | snelste werkpad: scan → ophalen/inleveren/onderhoud/kosten/brandstof/km/document |
| `pages/portal-admin/index.tsx` | `/api/portal-admin/dashboard` (60 s) | dialogen via `?fine=`, `?request=`, `?tab=` | |

## Globale dialogen (`contexts/GlobalDialogContext.tsx`)

reservation (view/edit), spareAssignment, apk, maintenance (zelfde component), vehicle, customer (initialTab), fine/newFine, portalRequest, portalList (customers/accounts/requests/fines/vehicles/activity/blacklist), fineImport(s), expenseVehicle, expense, rdwApkChanges (bij login, `App.tsx:46`), scan. `layouts/MainLayout.tsx:76-84` houdt een tweede, eigen set view/edit-dialoogstates bij voor zoekresultaten.

## Reserveringsworkflow

- `components/reservations/reservation-form.tsx` (3111 r.): 9 queries op form-watch (`:333-494`). Automatisch: einddatum start+3 (`:385`), totaalprijs uit dagprijs tot handmatig gewijzigd (`:587-595`), ophaal-km uit voertuig (`:561-571`), brandstofbeleid uit instellingen (`:462-482`), beschikbare-voertuigenlijst op datum (`:497-529`), blacklist beide richtingen (`:522-542`), live conflictcheck `/api/reservations/check-conflicts` (`:696-738`), BV→Opnaam-conversie als neveneffect van opslaan (`:876-909`). Handmatig: status opgehaald/ingeleverd opent een tweede dialoog na opslaan (`:1191-1216`); admin-wachtwoord-override voor oude reserveringen via rauwe fetch, 3 pogingen (`:932-992`); overdue-check met tussenscherm (`:1254-1287`).
- `pickup-return-dialogs.tsx` (1917 r.): ophalen haalt contractnummer op via `/api/settings/next-contract-number` (`:171-178`), vrij bewerkbaar met live duplicaatcheck (`:195-231`); km met wachtwoord-override bij lagere stand; brandstof; interactieve schadecheck + papieren upload met cleanup bij sluiten. Inleveren spiegelt dit.
- `status-change-dialog.tsx`: alleen terugdraaien opgehaald→geboekt, dubbele bevestiging (`:223-241`).
- `spare-vehicle-dialog.tsx`: handmatige keuze uit beschikbare lijst, geen suggestie. Vervangerstatus assigned→ready→picked_up→returned alleen via knoppen in `dashboard/spare-vehicle-assignments-widget.tsx:441-474`.
- `service-vehicle-dialog.tsx` (startdatum standaard vandaag, bewust vanwege eerdere bug `:75-78`), `return-from-service-dialog.tsx`, `edit-contract-number-dialog.tsx`, `reservation-view-dialog.tsx` (1099 r., print via `window.open`).
- Bestuurder: handmatige combobox per klant (`reservation-form.tsx:147-173`), automatisch gewist bij klantwissel (`:449-457`).

## Transport en vervangers

- `pages/delivery/dashboard.tsx`: categorisering op `deliveryStatus`; transportrijen worden server-side aangemaakt bij nieuwe bezorging (`:73-76`).
- TBD-afleiding centraal in `shared/transport-spare-status.ts` (not_required|tbd|assigned|picked_up|returned), expliciet om drift met `reservations.spareVehicleStatus` te voorkomen.
- Printen geblokkeerd zolang vervanger TBD (`:283-292`, `:341-351`): harde stop met toast.
- Bulk afronden via `Promise.all` zonder per-rij foutafhandeling (`:316-320`).
- Dialogen: transport-dialog, transport-view-dialog, route-optimization-dialog, spare-pickup-prompt-dialog, spare-vehicle-assignment-dialog.

## Onderhoud

`schedule-maintenance-dialog.tsx` (1598 r.): blok, of blok + vervanger in één submit (`maintenance-with-spare`, `:562`), TBD via `/api/placeholder-reservations` (`:421`). `maintenance-edit/view/list-dialog.tsx`. Markeren voor service gebeurt vanuit de reserveringskant; afronden gebeurt inline op de kalender in plaats van via `ReturnFromServiceDialog` (tweede implementatie).

## Voertuigen, klanten, bestuurders

- `vehicle-form.tsx` (2057 r.): verplicht alleen kenteken, merk, model (`:53-55`). `quick-status-change-button.tsx` alleen voor terugdraaien opgehaald→geboekt.
- `vehicle-delete-dialog.tsx`: delete-impact-preview + kenteken intypen (`:87-97`); `deleted-vehicles-dialog.tsx` (ook voor boetes): herstel met één klik zonder bevestiging (`:143-161`).
- `customer-form.tsx` (900 r.): alleen naam verplicht (`:29-60`); `driver-dialog.tsx`: alleen displayName (`:48`).
- Bulkimport alleen voor voertuigen (`vehicle-bulk-import-dialog.tsx`).

## Instellingen/beheer

Dialogen: Settings (`settings/settings-panel.tsx` 2615 r.: Business, Notifications, Documents, Doc-Emails EN/NL, Calendar, Email, Activity Log, Portal), Users & Permissions (`dialogs/users-dialog.tsx`), Backup (`dialogs/backup-dialog.tsx`: auto-backup, nu backuppen, **database herstellen zonder extra bevestiging**), Profile. `BackupStalenessBanner` op dashboard. Twee plekken beheren mailsjablonen (Settings → Doc-Emails en Communications).

## Dwarsdoorsnede

- Geen React ErrorBoundary: renderfout = wit scherm.
- Toasts consequent via `useToast`; optimistic updates op slechts 3 plekken.
- Socket: één verbinding, `data-update` → zachte invalidatie (`hooks/use-socket.tsx:75-88`).
- Client-side filtering van hele tabellen (vehicles, customers, delivery); kalenders laden ranged én volledig.
- Sneltoetsen alleen in de drie sjablooneditors.
- i18n: 16 namespaces nl/en gelijk; hardcoded Engels in `layouts/MainLayout.tsx:310,558`; tientallen `console.log` met entiteits-id's (`MainLayout.tsx:94,98,161,169,595,600`, `reservation-form.tsx`, `pickup-return-dialogs.tsx`).
- Mobiel: `maximum-scale=1` in `client/index.html:5` (geen pinch-zoom); reserveringskalender met 3 breakpoints in 4244 regels.
- Bulkacties alleen op transporten en meldingen.

## Werkproces-observaties (input voor fase 21–32)

1. Dubbele volledige tabel-fetch op de twee zwaarste pagina's.
2. Client-side filtering voor voertuigen/klanten schaalt niet.
3. Geen route-permissieguard; URL-typen omzeilt de sidebar.
4. Twee mailsjabloon-beheerplekken.
5. Twee implementaties van "terug uit service".
6. Zware delete-bevestiging vs. herstel zonder bevestiging.
7. Statusovergang via omweg (opslaan, dan tweede dialoog): verwarring mogelijk.
8. Reservering opslaan wijzigt stilzwijgend voertuigregistratie (BV→Opnaam).
9. Vrijwel geen verplichte klant-/bestuurdersvelden; blokkeert later ophalen/contract.
10. Geen bulkacties buiten transporten.
11. Dubbel dialoogbeheer in MainLayout naast de globale context.
12. TBD-printblokkade zonder directe route naar de fix.
13. Geen ErrorBoundary.
14. Debuglogging in productiebuild.
15. Mobiel onbruikbaar op de reserveringskalender; pinch-zoom uit.
