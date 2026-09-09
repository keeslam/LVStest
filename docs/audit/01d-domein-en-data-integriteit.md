# Fase 1d — Domeinlogica, statusmachines, data-integriteit (leesonderzoek)

2026-09-09, commit 3e28645e. Nog niet runtime-bewezen; input voor fase 9–13.

## Entiteiten (47 tabellen) — afwijkingen

- Soft delete alleen op `reservations` (`deletedAt/deletedBy`); voertuigen en boetes via prullenbak-snapshot in `deleted_records`; overige tabellen hard delete.
- **Niet-afgedwongen FK-kolommen** (integer zonder `.references`): `reservations.vehicleId`, `reservations.customerId`, `replacementForReservationId`, `replacementForTransportId`, `affectedRentalId`, `recurringParentId`, `portalRequestId`, `expenses.vehicleId` (NOT NULL), `documents.vehicleId`, `documents.reservationId`, `scanEvents.vehicleId/reservationId`, `fines.importFileId`, `deletedRecords.deletedByUserId`.
- Cascade-FK's die wél bestaan: drivers, portalUsers, portalCustomerSettings, portalActivityLog, portalRequests(+attachments/messages), portalNotifications, portalDocumentAcks, vehicleCustomerBlacklist, apkDateChanges, deliveryTasks, vehicleTransports.vehicleId, passwordHistory, activeSessions.
- `interactiveDamageChecks` unique(reservationId, checkType); `damageCheckTemplates` partial unique index op default.

## Statusmachines

| Veld | Waarden | Afgedwongen | Niet afgedwongen / dubbel |
|---|---|---|---|
| `reservations.status` | booked→picked_up→completed, cancelled, legacy returned (`VALID_RESERVATION_TRANSITIONS` schema.ts:42) | `PATCH /:id/status` (routes.ts:3254) | `PATCH /:id/basic` (3120) en `PATCH /:id` (3445) schrijven `status` zonder check; `/status` kent eigen omkeer-allowlist buiten de tabel (3255-3271); `pickupReservation`/`returnReservation` (database-storage.ts:1624,1718) hebben eigen prerequisites |
| `vehicles.availabilityStatus` | available/scheduled/needs_fixing/not_for_rental/rented | manuele PATCH via `validateManualStatusChange` (routes.ts:1169); `getStatusOnPickup` | `vehicle-status-helper.ts` `calculateCorrectStatus`, `getStatusOnMaintenanceStart/End`, `getStatusOnReservationCancel` dood; `returnReservation` importeert `getStatusOnReturn` maar gebruikt inline logica (1775-1781); `syncVehicleAvailabilityWithReservations` (224-353) negeert onderhoudsblokken en leidt `needs_fixing` nooit af |
| `vehicles.maintenanceStatus` | ok/needs_service/in_service | `markVehicleForService`, `/mark-needs-service` (routes.ts:3792) | geen transitietabel |
| `reservations.maintenanceStatus` | scheduled/in/out (+ `in_service` in helper:58) | geen validator | waardensets inconsistent |
| `spareVehicleStatus` | assigned→ready→picked_up→returned, cancelled (schema.ts:51) | `/spare-status` (routes.ts:4013) | pickup/return schrijven direct (1676,1758) |
| `spareAssignmentDecision` | spare_assigned/customer_arranging/not_handled | geen | – |
| `vehicle_transports.status` | scheduled/in_progress/completed/cancelled | geen tabel; `applyTransportUpdate` (2025) checkt geen from-state | – |
| `fines.status` (`shared/fines.ts`) | new↔linked↔cancelled | `/fines/:id/status` (routes/fines.ts:313) | create/algemene PATCH accepteren `status` mogelijk ongefilterd |
| `portal_requests.status` | new→in_progress/done/rejected | overal via `isValidRequestTransition` (best beschermd) | – |
| bezorging | `deliveryTasks.status` en `reservations.deliveryStatus` met verschillende waardensets | geen | eenrichtingssync `syncDeliveryTransport` (1167) alleen aan/uit |

## Beschikbaarheid: vijf implementaties

| Implementatie | Aanroepers | Overlap | Extra filters |
|---|---|---|---|
| `checkReservationConflicts` (database-storage.ts:1528) | POST reservations, PATCH basic, maintenance-with-spare, applyTransportUpdate, portaalgoedkeuring, `/vehicles/:id/overlaps` | zelfde-dag-overdracht toegestaan tenzij tijden overlappen; onderhoudsblok ≠ verhuur | **geen check op `availabilityStatus`** |
| `syncVehicleAvailabilityWithReservations` (224) | na bijna elke reserveringsschrijfactie | datumbereik zonder tijd; blokken uitgesloten | raakt alleen available/scheduled/rented |
| `getAvailableVehiclesInRange` (3109) | `/api/vehicles/available`, `/api/spare-vehicles/available` | **geen zelfde-dag-uitzondering** | sluit in_service, not_for_rental, needs_fixing uit |
| `listBusyVehicleIds` (services/portal-storage.ts:264) | portaal-alternatieven | platte overlap, **blokken tellen mee** | + NOT_RENTABLE/blacklist in route |
| `vehicle-status-helper.getVehicleStatusContext` | alleen manuele statuswissel | datumbereik op reeds opgehaalde lijst | – |

Gevolg: `not_for_rental`/`needs_fixing` voertuig is via `POST /api/reservations` boekbaar; UI-picker verbergt hem.

## Schrijfpaden op `reservations`

| Pad | Validatie | Transactie | Neveneffecten |
|---|---|---|---|
| `POST /api/reservations` (routes.ts:2435) | zod, blacklist, conflicten, overdue | nee | BV→Opnaam, bestuurder, sync, broadcast, contract uit preview-token, document |
| idem maintenance_block (2528) | conflictcheck **ná** insert | nee | hook |
| `maintenance-with-spare` (2787) | vergelijkbaar | niet transactioneel | vervanger, servicestatus |
| `PATCH /:id/basic` (3090) | zod + conflicten, geen transitie | nee | BV→Opnaam, sync |
| `PATCH /:id/status` (3230) | transitie + omkeer-allowlist + km | – | – |
| `PATCH /:id` (3445) | handmatige coercie, geen transitiegate | nee | – |
| `POST /:id/pickup` (4067) | contractnummer, km-autorisatie | **nee**: reservering en voertuig apart (1664,1710) | override-clear read-then-clear, PDF + document |
| `POST /:id/return` (4249) | km | **nee** (1751,1783) | sync, schadecheck |
| `DELETE /:id` (4621) | bestaat/niet al verwijderd | **nee**: loop soft-deletes vervangers, meldingen, sync | dubbele auditlog (middleware + handmatig) |
| `storage.deleteReservation` (1270) | – | – | hard delete, ongebruikt door route |
| `applyTransportUpdate` (2025) | conflicten met heel-dag-venster, statusguards | **ja**, maar `checkReservationConflicts` gebruikt pool-`db`, niet `tx` | markVehicleForService, sync |
| `assignDriverToReservation` (services/driver-assignments.ts:21) | – | ja | driverId gespiegeld |
| portaalgoedkeuring (routes/portal-requests.ts:172-259) | blacklist, NOT_RENTABLE, conflicten, één auto per bestuurder | nee | createReservation, sync, audit |
| recurring-velden | via generieke PATCH instelbaar | – | **geen generator**: functie bestaat alleen in schema |

## Verwijderen en prullenbak

- Voertuig (`deleteVehicle` 535-618): transactioneel, snapshot + handmatige opschoning; documenten alleen op `vehicleId` gematcht → document met alleen `reservationId` blijft hangen.
- Restore (637-725): transactioneel, id/kenteken-check vóór transactie (kleine TOCTOU).
- Boete-restore (728-757): nul-t niet-bestaande FK's stil.
- **Klant (`deleteCustomer` 980-986, route routes.ts:2114): hard delete zonder impactcheck, bevestiging of snapshot; cascade wist bestuurders, portaalaccounts, aanvragen, meldingen; `reservations.customerId` blijft dangling.**
- Reservering: alleen soft delete, geen snapshot, geen restore-endpoint.

## Transacties

9× `db.transaction`: deleteVehicle (540), restoreDeletedRecord (663), restoreDeletedFine (751), applyTransportUpdate (2029), 3× default-sjabloonwissel (4101,4119,4152), assignDriverToReservation. Zonder: createReservation (+syncDeliveryTransport), updateReservation, pickup/return, POST reservations-route, DELETE-route, portaalgoedkeuring, `getNextContractNumber`. `checkReservationConflicts` nooit met `tx`.

## Auditlog

`auditMutations` (server/middleware/audit.ts, routes.ts:259) logt elke geslaagde mutatie onder `/api/*` (diffing voor vehicles, customers, reservations, expenses, documents, users); daarbovenop 9 handmatige `AuditLogger`-sites → **dubbele rijen** per actie (vehicle.delete, reservation.delete, fines). Mislukte verzoeken niet gelogd behalve auth/delete-bevestiging.

## Nummering

| Id | Generatie | Race-veilig |
|---|---|---|
| Contractnummer | `getNextContractNumber` (3626): scan + mediaan-ceiling, suggestie naar client, terug bij pickup | **nee** (read-then-use); alleen DB-unique als vangnet, generieke 400 |
| Debiteurnummer | vrije tekst | geen unique |
| Voertuigbarcode | uit PK, unique | ja |
| Import-hash | unique | ja |

## Integriteitsrisico's (gerangschikt)

1. Conflictcheck zonder lock/transactie op alle schrijfpaden → dubbele boeking mogelijk (1528-1622).
2. `reservations.vehicleId/customerId` zonder FK; `deleteCustomer` laat wezen achter (980-986).
3. `deleteCustomer` cascadeert stil en onherstelbaar (routes.ts:2114).
4. Status omzeilt statusmachine via `/basic` en generieke PATCH (3090, 3445).
5. Vijf beschikbaarheidsdefinities; API boekt niet-verhuurbare auto.
6. Pickup/return niet-atomair (1664-1713, 1751-1786).
7. Contractnummer client-gedreven (3626, routes.ts:4074-4136).
8. Documenten via alleen `reservationId` blijven hangen bij voertuigverwijdering (592-593).
9. Dode statushelper; sync leidt `needs_fixing` niet af (helper:147-303, 224-353).
10. `expenses.vehicleId` NOT NULL zonder FK (schema.ts:1002).
11. `fines.importFileId`, `deletedRecords.deletedByUserId` zonder FK.
12. Dubbele auditrijen (audit.ts:171-231 vs routes.ts:4712).
13. Recurring-velden zonder implementatie.
14. Boete-restore verliest koppelingen stil (745-749).
15. Reservering-delete-cascade in losse loop zonder transactie (4684-4696).
