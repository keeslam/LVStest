| BUG | Sev | Verdict | Bewijs |
|---|---|---|---|
| BUG-001 | CRITICAL | FIXED | manager id=7 met permissie manage_users: POST /api/users {role:"admin"} -> 403 "Only an administrator can create an administrator account"; PATCH /api/users/7 … |
| BUG-002 | CRITICAL | FIXED | POST /api/portal/requests {payload:"not-json-at-all"} als portaal-test@example.com -> 400 {"error":"payload is not valid JSON","code":"PORTAL_VALIDATION"}; dir… |
| BUG-003 | CRITICAL | FIXED | Verse cookie jar zonder login (XSRF-TOKEN wel verkregen via GET /): POST /api/expenses/with-receipt -> 401, GET /api/expenses/1/receipt -> 401, PATCH /api/expe… |
| BUG-004 | CRITICAL | FIXED | maintenance-with-spare blok 3293 + vervanger 3294, vervanger opgehaald (200, status picked_up); tweede maintenance-with-spare met maintenanceId=3293 en een and… |
| BUG-005 | CRITICAL | FIXED | socket.io-client zonder cookie naar 127.0.0.1:5003 -> connect_error "unauthorized", 0 events ontvangen terwijl een admin intussen voertuigen aanmaakte; met ses… |
| BUG-006 | CRITICAL | FIXED | 20 gelijktijdige POST /api/reservations (raw http, keepAlive:false, identiek bereik op voertuig 1790) -> {"201":1,"409":19}, de 19 met {"code":"CONFLICT"}. |
| BUG-007 | CRITICAL | FIXED | besluiten B-08: klant 1254 met booked reservering 3226 -> GET /api/customers/1254/delete-impact geeft blocked:true + blockingReservations[3226]; DELETE /api/cu… |
| BUG-008 | HIGH | FIXED | 5+ mislukte logins op een wegwerpaccount -> 429 {"message":"Account temporarily locked ... try again in 15 minute(s)","remainingTime":899} (was 135 minuten / 8… |
| BUG-009 | HIGH | NOT FIXED | 10 opeenvolgende POST /api/login met telkens een andere gespoofte X-Forwarded-For (gewone IPv4, ::ffff:127.0.0.1, multi-hop "127.0.0.1, 203.0.113.5") en 10 ver… |
| BUG-010 | HIGH | FIXED | app_settings.email_config bevat in de DB letterlijk smtpPassword "AUDIT-P36A-smtp-pw"; user met permissions:["manage_backups"] krijgt GET /api/settings -> 403,… |
| BUG-011 | HIGH | FIXED | user id=8 met permissions:[]: PUT /api/system-settings {contractNumberStart:999999,tollRatePerKm:"9.99"} -> 403 {"message":"Not authorized. One of these permis… |
| BUG-012 | HIGH | FIXED | documents.file_path via SQL op 'package.json', '../LVStest-main/package.json' en een absoluut pad gezet: GET /api/documents/view|download/:id geeft in alle dri… |
| BUG-013 | HIGH | CHANGED BY DECISION | besluiten B-09 (waarschuwen, medewerker mag doorgaan): blok 3254 (2027-10-01..10-10) daarna standaardhuur 2027-10-03..10-05 -> 201 met warnings:[{"code":"MAINT… |
| BUG-014 | HIGH | FIXED | Blok 3269 + assign-spare (vervanger 3270 op voertuig 1727), daarna DELETE /api/reservations/3269 -> 200; SQL: vervanger 3270 heeft deleted_at=2026-09-12 19:00:… |
| BUG-015 | HIGH | FIXED | user met permissions:["view_reservations"]: PATCH /api/reservations/3221/spare-status {"spareVehicleStatus":"returned"} -> 403 {"message":"Not authorized. One … |
| BUG-016 | HIGH | FIXED | PATCH /api/reservations/3240/basic status=completed -> 400 INVALID_STATUS_TRANSITION; PATCH /api/reservations/3241 status=completed -> 400 INVALID_STATUS_TRANS… |
| BUG-017 | HIGH | FIXED | Klant 1248 geblacklist op voertuig 1704; reservering 3244 (klant 1247) daarna PATCH /api/reservations/3244 {"customerId":1248} -> 409 "This customer is blackli… |
| BUG-018 | HIGH | CHANGED BY DECISION | besluiten B-01 + B-03: voertuig op not_for_rental -> POST /api/reservations 409 {"code":"NOT_FOR_RENTAL"}; voertuig op needs_fixing blijft bewust boekbaar (201… |
| BUG-019 | HIGH | FIXED | Reservering 3245 (2027-10-01..10-05): PATCH /status picked_up daarna completed -> 200 met endDate="2027-10-05" (onveranderd, niet vandaag); via POST /pickup + … |
| BUG-020 | HIGH | FIXED | POST /api/vehicles "P36A-020-2828" -> 201; daarna "p36a0202828" -> 409 en "P36A 020 2828" -> 409, beide met dezelfde duplicaatmelding als het exacte duplicaat.… |
| BUG-021 | HIGH | FIXED | PATCH /api/vehicles/1669 {"availabilityStatus":"banana_not_real"} -> 400 {"code":"INVALID_AVAILABILITY_STATUS","details":{"received":"banana_not_real","allowed… |
| BUG-022 | HIGH | FIXED | besluiten B-14: voertuig met reserveringen van twee verschillende klanten -> GET /api/vehicles/:id/delete-impact geeft blocked:true en blockingReservations met… |
| BUG-023 | HIGH | FIXED | user met permissions:[]: POST /api/migrate/customer-drivers {} -> 403 {"message":"Not authorized. One of these permissions required: manage_customers"}. |
| BUG-024 | MEDIUM | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id in besluiten.md over wachtwoordhergebruik). POST /api/users/change-password met newPassword === currentPassword -> 200 "P… |
| BUG-025 | MEDIUM | FIXED | POST /api/settings/contract-number-override {"overrideNumber":99999999999} -> 400 "Must be a whole number between 1 and 2147483647"; PUT /api/system-settings {… |
| BUG-026 | MEDIUM | FIXED | Server draait met UPLOADS_DIR=...\regress-uploads; contract gegenereerd naar documents/1773/contract_unsigned/...pdf, en GET /uploads/documents/1773/contract_u… |
| BUG-027 | MEDIUM | FIXED | Twee keer GET /api/contracts/generate/3319 -> twee documents-rijen met VERSCHILLENDE bestandspaden (..._2026-09-12T19-05-23-661Z_ou9b.pdf vs ..._19-05-23-730Z_… |
| BUG-028 | MEDIUM | FIXED | GET /api/contracts/generate/:id?templateId=2 (template "gffg" met fields:[]) -> 409 "The PDF template \"gffg\" has no fields, so the contract would be complete… |
| BUG-029 | MEDIUM | FIXED | POST /api/delivery/transports/generate-report {transportIds:[43,41,42]} -> 201, documents.file_path = "reports/Transport_Reports_3_vehicles_12-09-2026_78787.pd… |
| BUG-030 | MEDIUM | FIXED | POST /api/documents met filename "malware.exe" -> 400 (was 500) {"message":"This file type is not permitted for security reasons"}. Restpunt: de body bevat in … |
| BUG-031 | MEDIUM | FIXED | POST /api/reservations/:id/mark-needs-service {serviceStartDate:"2099-01-01",serviceEndDate:"2020-01-01"} -> 400 {"message":"Invalid service date range","error… |
| BUG-032 | MEDIUM | FIXED | Twee keer assign-spare op blok 3266 met verschillende spares -> beide 200, maar SQL toont vervanger 3267 op status 'cancelled' en alleen 3268 nog 'booked': pre… |
| BUG-033 | MEDIUM | FIXED | POST /api/reservations/maintenance-with-spare met maintenanceData zonder vehicleId -> 400 {"message":"Invalid maintenance data","errors":[{"field":"type","mess… |
| BUG-034 | MEDIUM | CHANGED BY DECISION | besluiten B-09 (+B-01/B-03): een blok dat vandaag dekt zet vehicles.availability_status wel degelijk op needs_fixing — niet synchroon bij create (t+0s en t+3s … |
| BUG-035 | MEDIUM | FIXED | POST /api/placeholder-reservations {originalReservationId:3263 (klant 1247), customerId:1248} -> 201, maar SQL toont customer_id=1247: de server leidt de klant… |
| BUG-036 | MEDIUM | FIXED | PATCH /api/reservations/:id/spare-status {"spareVehicleStatus":"ready"} op een type:"standard" reservering -> 400 {"message":"Spare vehicle status can only be … |
| BUG-037 | MEDIUM | CHANGED BY DECISION | besluiten B-09 ("twee overlappende onderhoudsblokken op één auto vallen onder dezelfde regel" = waarschuwen, opslaan mag): blok 3421 (2028-11-01..11-10) daarna… |
| BUG-038 | MEDIUM | FIXED | Tweede POST /api/reservations/:id/pickup met een al gebruikt contractnummer -> 409 {"message":"Contract number \"P36C-DUP-9372828\" is already used by reservat… |
| BUG-039 | MEDIUM | FIXED | POST /api/reservations met vehicleId 999999999 -> 404 {"message":"Vehicle not found","field":"vehicleId"}; met customerId 999999999 -> 404 {"message":"Customer… |
| BUG-040 | MEDIUM | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id over backdaten/overdue-guard). POST /api/reservations {startDate:"2020-01-01",endDate:"2020-01-05"} op vers voertuig 1707… |
| BUG-041 | MEDIUM | FIXED | POST /api/vehicles {departureMileage:-500,returnMileage:-20} -> 400 met per veld "Mileage cannot be negative"; PATCH /api/vehicles/1668 {departureMileage:-999}… |
| BUG-042 | MEDIUM | FIXED | POST /api/vehicles apkDate "2026-02-30" -> 400 "That is not a real calendar date"; apkDate "99999-01-01" -> 400 "Use the yyyy-MM-dd format" + "That is not a re… |
| BUG-043 | MEDIUM | FIXED | 10 gelijktijdige POST /api/deleted-records/41/restore (raw http, keepAlive:false) -> {"200":1,"409":9}, de negen met {"code":"ALREADY_RESTORED"}; geen enkele 5… |
| BUG-044 | MEDIUM | FIXED | POST /api/customers {"name":" "} -> 400 {"message":"Invalid customer data", issues:[{code:"too_small",minimum:1,message:"Name is required"}]}. |
| BUG-045 | MEDIUM | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id over uniciteit van het debiteurnummer). Twee klanten met hetzelfde debtorNumber "AUDIT-P36A-DEB-9372828" -> 201 (id 1252)… |
| BUG-046 | MEDIUM | FIXED | GET /api/rdw/vehicle/AB-123-C zonder enige cookie -> 401 {"message":"Unauthorized"} (was 404 uit de echte RDW-lookupketen). |
| BUG-047 | MEDIUM | FIXED | POST /api/login (skipPrime) levert XSRF-TOKEN T1; de eerstvolgende muterende call POST /api/customers met precies dat token -> 201, geen CSRF_INVALID. |
| BUG-048 | LOW | FIXED | POST /api/pdf-templates met fields als array-van-strings -> 400 "Expected object, received string"; met fields als object -> 400 "fields must be an array of fi… |
| BUG-049 | LOW | FIXED | POST /api/documents met het file-onderdeel vóór vehicleId -> 400 (was 500) "Vehicle ID is required. Send vehicleId before the file, or as a query parameter." R… |
| BUG-050 | LOW | FIXED | Template 7 aangemaakt, background geüpload (regress-uploads/templates/template_7_background.png aanwezig), DELETE /api/pdf-templates/7 -> 200 en een directory … |
| BUG-051 | LOW | FIXED | GET /object-storage/anything zonder sessiecookie -> 401 {"message":"Unauthorized"} (was 500 "Error loading file from object storage", identiek aan een adminses… |
| BUG-052 | LOW | FIXED | PATCH /api/reservations/3243 {"maintenanceStatus":"garbage"} op een maintenance_block -> 400 {"errors":[{"field":"maintenanceStatus","message":"Invalid input"}… |
| BUG-053 | LOW | FIXED | Serverzijde per item correct: PATCH /api/transports/42 en /api/transports/999999999 parallel -> 200 resp. 404 "Transport not found", en SQL bevestigt transport… |
| BUG-054 | LOW | NOT FIXED | Twee van de drie gevallen zijn dicht: totalPrice -1 en 1e308 geven nu 400 "The amount must be between 0 and 10000000". Maar POST /api/reservations {totalPrice:… |
| BUG-055 | LOW | NOT FIXED | De bestuurdershelft is gerepareerd: reservation_driver_assignments rij 292 krijgt assigned_until=2026-09-12 19:09:39 na DELETE /api/reservations/:id. De docume… |
| BUG-056 | LOW | NOT FIXED | Eigenaarsbesluit ontbreekt (geen B-id over terugkerende reserveringen). POST /api/reservations {isRecurring:true,recurringFrequency:"weekly"} -> 201 (id 3249),… |
| BUG-057 | LOW | NOT APPLICABLE | Dev-only en door de eigen bronregel als omgevingsconfiguratie geclassificeerd ("Regressietest: N.v.t."). Runtime op deze dev-server: POST /api/reservations met… |
| BUG-058 | LOW | FIXED | POST /api/vehicles met een emoji-kenteken -> 400 {"field":"licensePlate","message":"License plate is too long"} + formaatfout; met 500 X'en -> 400 met dezelfde… |
| BUG-059 | LOW | FIXED | POST /api/customers met een naam van 5000+ tekens -> 400 {"code":"too_big","maximum":255,"message":"Name is too long"}. |
| BUG-060 | CRITICAL | FIXED | Anon POST /api/expenses/with-receipt -> 401 {"message":"Not authenticated"} (GET /api/expenses 401, POST /api/expenses 401); as manage_expenses a body with rec… |
| BUG-061 | CRITICAL | FIXED | AUDIT-P36B-viewer (view_portal) GET /api/portal-admin/customers/999999999/settings -> 404 {"message":"Customer not found"}; id 2147483647 -> 404; /health uptim… |
| BUG-062 | HIGH | FIXED | tsx-evaluated server/initAdmin.ts: resolveDefaultAdminPassword({NODE_ENV:'production'}) THROWS 'DEFAULT_ADMIN_PASSWORD is not set. Refusing to create the first… |
| BUG-063 | HIGH | FIXED | AUDIT-P36B-manager (role manager, manage_users) PATCH /api/users/5 {"password":...} -> 403 'Only an administrator can set another account's password'; PATCH se… |
| BUG-064 | HIGH | FIXED | AUDIT-P36B-nobody (permissions []) DELETE /api/reservations/3213 -> 403 {"message":"Not authorized. One of these permissions required: manage_reservations"}; t… |
| BUG-065 | HIGH | FIXED | As permissions:[] all seven routes -> 403: GET /api/interactive-damage-checks, GET /:id, POST, PUT /:id, GET /:id/pdf, DELETE /:id and GET /api/vehicles/2/dama… |
| BUG-066 | HIGH | FIXED | POST /api/vehicle-diagram-templates, PATCH /api/vehicle-diagram-templates/1 and DELETE /api/vehicle-diagram-templates/1 as permissions:[] -> 403 'required: man… |
| BUG-067 | HIGH | FIXED | DELETE /api/settings/contract-number-override as permissions:[] and as viewer -> 403 'required: manage_settings'; POST with {"overrideNumber":999123} as permis… |
| BUG-068 | HIGH | FIXED | As permissions:[]: GET /api/placeholder-reservations, /api/placeholder-reservations/needing-assignment, /api/vehicles/2/customers-with-reservations, /api/spare… |
| BUG-069 | HIGH | NOT FIXED | /api/backups/restore-files is fixed (archive with member dist/server/index.js -> 400 'entries that would be written outside the uploads directory', absolute-pa… |
| BUG-070 | HIGH | NOT FIXED | Regression clause 1 fails: PATCH /api/pdf-templates/2 {"backgroundPath":"../../AUDIT-P36B-canary.txt"} -> 200 and the value is stored (server/routes/pdf-templa… |
| BUG-071 | HIGH | FIXED | POST /api/fines/cjib-config/test as manage_fines with host 127.0.0.1:5432 (open), 169.254.169.254:80, nonexistent.invalid:21, example.com:21 and ftp.cjib.nl:21… |
| BUG-072 | HIGH | FIXED | POST /api/expenses receiptUrl='javascript:alert(1)' -> 400 'Only http(s), mailto, tel links or a path inside this application are allowed'; a local Windows pat… |
| BUG-073 | HIGH | FIXED | Portal POST /api/portal/drivers with licenseFilePath='x" onmouseover="AUDITP36B' -> 201 with the field dropped (driverInputSchema whitelist, server/routes/port… |
| BUG-074 | HIGH | FIXED | 1010 GET /api/vehicles as one logged-in user while rotating X-Forwarded-For over 6 values -> 429 at request #995 (RateLimit-Limit 1000, 993x200 then 429); a di… |
| BUG-075 | HIGH | FIXED | GET /api/backups/download-data as AUDIT-P36B-manager (manage_backups) -> 200, 20,513,305 bytes of pg_dump output; the body contains no 'postgres://' and no 'pa… |
| BUG-076 | MEDIUM | NOT APPLICABLE | REFUTED by the plan (09-remediation-plan.md:224, hardening only). Hardening verified: POST /api/backups/upload with filename="../../AUDIT-P36B-esc.sql" -> 200 … |
| BUG-077 | MEDIUM | FIXED | POST /api/app-settings/email/test as manage_settings to 127.0.0.1:5432 (port open), 127.0.0.1:9 (port closed) and 169.254.169.254:80 -> all three 400 with the … |
| BUG-078 | MEDIUM | FIXED | tsx-evaluated buildCspDirectives(true) -> scriptSrc ["'self'"], connectSrc ["'self'","wss:"], imgSrc ["'self'","data:","blob:"], no cdn.jsdelivr.net and no 'un… |
| BUG-079 | MEDIUM | FIXED | code-inspectie: server/index.ts:300-316 only monkeypatches res.json when LOG_RESPONSE_BODIES==='true' (an opt-in that is not set here), and :327 pipes whatever… |
| BUG-080 | MEDIUM | FIXED | code-inspectie: server/utils/email-service.ts:186 derives rejectUnauthorized = !(smtpAllowInvalidCert), :378 passes it to the send transport and :314 to the te… |
| BUG-081 | MEDIUM | NOT APPLICABLE | Deferred by the plan: 09-remediation-plan.md:229 classifies it BUSINESS-DECISION, 'n/a until decided' (OPT-027), and besluiten.md has no B-id for it. Unchanged… |
| BUG-082 | MEDIUM | NOT APPLICABLE | Deferred by the plan (09-remediation-plan.md:230, DEFERRED until the real Coolify/Traefik hop count is known) - and it still reproduces exactly: logging in wit… |
| BUG-083 | MEDIUM | FIXED | server/portal-auth.ts:190 is now `secret: resolveSessionSecret()` and the string 'portal-dev-secret' no longer exists in the tree, so the portal no longer sign… |
| BUG-084 | MEDIUM | FIXED | AUDIT-P36B-manager PATCH /api/reservations/3224 {"id":9999,"deletedBy":"AUDIT-P36B-forged","deletedAt":null,"createdBy":"AUDIT-P36B"} -> 200; SQL afterwards: i… |
| BUG-085 | MEDIUM | FIXED | AUDIT-P36B-viewer (view_vehicles/view_customers/... only) GET /uploads/, /uploads/templates/ and /uploads/temp/ -> 403 on all three; the static mount no longer… |
| BUG-086 | MEDIUM | FIXED | Portal POST /api/portal/requests with message 'AUDIT-P36B-JSON-<a href="javascript:alert(3)">click</a>' as JSON -> stored 'AUDIT-P36B-JSON-click' (id 578); the… |
| BUG-087 | MEDIUM | FIXED | As manage_portal, PUT /api/portal-admin/config allowedFrameOrigins with "https://a.example; script-src * 'unsafe-inline'", "https://b.example/path", "https://c… |
| BUG-088 | MEDIUM | FIXED | GET /api/damage-check-templates/by-vehicle?vehicleId=2 -> 200 as admin and 200 as AUDIT-P36B-viewer (was 500 for every identity); the /by-vehicle route is no l… |
| BUG-089 | MEDIUM | FIXED | GET /api/reports/maintenance-costs -> 200 without parameters and 200 with ?startDate=2026-01-01&endDate=2026-12-31, as admin (was an unconditional 500). |
| BUG-090 | MEDIUM | FIXED | Two identities firing DELETE /api/reservations/3361 in parallel -> 200 {"message":"Reservation deleted successfully","deletedBy":"AUDIT-P36B-manager"} and 410 … |
| BUG-091 | MEDIUM | FIXED | Throwaway user AUDIT-P36B-s1789239851890 logged in twice; session A POST /api/users/change-password -> 200, immediately after that session B GET /api/user -> 4… |
| BUG-092 | MEDIUM | FIXED | 14 consecutive POST /api/portal/forgot for portaal-test@example.com from one IP -> 200 for #1-#10 and 429 'Too many requests, please try again after 15 minutes… |
| BUG-093 | LOW | FIXED | Anonymous GET /health -> 200 with body {"status":"OK","timestamp":...,"uptime":910.7,"database":{"connected":true,"pool":{...}}} - no envVars key and no userCo… |
| BUG-094 | LOW | FIXED | SQL over users.password: every hash written by this branch ends in '.s65536.8.1' (N=2^16, r=8, p=1 recorded in the hash string, server/auth.ts SCRYPT_PARAMS), … |
| BUG-095 | LOW | FIXED | After POST /api/logout for the session on X-Forwarded-For 198.51.100.93 (and the password-revoked session .92), SELECT count(*) FROM active_sessions WHERE ip_a… |
| BUG-096 | LOW | NOT FIXED | Half fixed: verifyCsrfToken now compares with crypto.timingSafeEqual (server/middleware/security/csrf.ts:54-62). The documented regression clause 'anonymous GE… |
| BUG-097 | LOW | NOT APPLICABLE | REFUTED by the plan (09-remediation-plan.md:245, hardening only). The hardening did land - the includes() blacklist is replaced by an isPlainFilename() basenam… |
| BUG-098 | LOW | FIXED | Planted a directory junction regress-uploads/AUDIT-P36B-leakdir -> LVStest-main/AUDIT-P36B-outside-dir (a real symlink needs Administrator on this host) with a… |
| BUG-099 | LOW | FIXED | fetchWithTimeout (server/utils/security/outboundGuard.ts), which both geocoding calls now use, aborted a never-answering local HTTP server after 1507 ms with A… |
| BUG-100 | LOW | FIXED | POST /api/app-settings category 'email' with fromName containing CR+LF -> 400 {"message":"Invalid e-mail settings","errors":[{"field":"fromName","message":"A l… |
| BUG-101 | LOW | FIXED | POST /api/fines/imports/upload as manage_fines with a 19,600,022-byte XML nested 2.8M levels deep -> 400 (import row status 'failed'); /health uptime 776.35331… |
| BUG-102 | LOW | FIXED | client/src/pages/reports/index.tsx:1259 still assigns doc.body.innerHTML, but every server-supplied value now goes through escapeHtml (18 call sites: brand, mo… |
| BUG-103 | LOW | FIXED | As admin: GET /api/settings/abc -> 400 {"message":"Invalid id","field":"id"}, /api/settings/%00 -> 400 'Invalid characters in URL', /api/settings/<46 digits> -… |
| BUG-104 | LOW | FIXED | POST /api/interactive-damage-checks with an empty body -> 400 {"message":"Invalid damage check data","errors":[{"field":"vehicleId","message":"Required"},{"fie… |
| BUG-105 | LOW | FIXED | After exhausting the portal-forgot bucket on IP 203.0.113.200 (429 from request #11), POST /api/login with staff credentials from that same IP -> 200 and POST … |
| BUG-106 | CRITICAL | FIXED | PATCH /api/reservations/3214 {endDate:2027-10-27} -> 409 CONFLICT en de rij blijft 2027-10-17..21; PATCH B {startDate} -> 409; PATCH A {vehicleId: bezet 1671} … |
| BUG-107 | CRITICAL | FIXED | Voertuig 1672 met D..D+3: eendaagse boeking op D -> 409, middenin -> 409, op D+3 -> 201 (turnover); tweemaal hetzelfde eendaagse bereik op 1673 -> tweede 409, … |
| BUG-108 | HIGH | FIXED | DELETE /api/vehicles/1678 met een booked reservering -> 409 VEHICLE_HAS_LIVE_RESERVATIONS (B-14); na annuleren delete 200 en POST /api/reservations op datzelfd… |
| BUG-109 | HIGH | CHANGED BY DECISION | B-03: voertuig 1753 op needs_fixing + maintenance in_service -> POST /pickup 409 VEHICLE_IN_WORKSHOP (overridable) en PATCH /status {picked_up} 409; pickup met… |
| BUG-110 | HIGH | FIXED | delete-impact van voertuig 1859 telt apk_date_changes 1, reservation_driver_assignments 1, fines.vehicle_id 1, fines.reservation_id 1, vehicle_transports.relat… |
| BUG-111 | HIGH | FIXED | PATCH /api/reservations/3220: {startDate:'not-a-date'} 400 'Use the yyyy-MM-dd format', {endDate < start} 400 'End date must be on or after start date', {start… |
| BUG-112 | HIGH | CHANGED BY DECISION | B-04: GET /api/reservations/3441/cancel-impact toont transports[54], spares[3442], drivers[296]; PATCH /status {cancelled, cascade:{transports:true,spares:true… |
| BUG-113 | HIGH | CHANGED BY DECISION | B-02: POST /api/reservations/3302/return zet de status direct op 'completed' (niet 'returned'); een boeking 30 dagen later op datzelfde voertuig -> 201. Bestaa… |
| BUG-114 | HIGH | FIXED | PATCH /api/transports/44 {scheduledDate:'2027-04-02'} -> vervangingsreservering 3323 staat daarna op 2027-04-02..2027-04-02; een tweede transport dat dezelfde … |
| BUG-115 | HIGH | FIXED | PATCH /api/transports/46 {status:'cancelled'} -> vervangingsreservering 3324 is weg (select geeft null), reservevoertuig 1783 staat weer op 'available', en een… |
| BUG-116 | HIGH | FIXED | PATCH /api/transports/44 {vehicleId: 1779 = de huidige relatedVehicleId} -> 400 'Replacement vehicle cannot be the same as the original vehicle'; vehicle_id/re… |
| BUG-117 | HIGH | FIXED | Portaalblok 3379 met toegewezen vervanger 3380 (voertuig 1835): goedkeuring van de maintenance_change verplaatst het blok naar 2026-10-12..13 en vervanger 3380… |
| BUG-118 | HIGH | FIXED | Twee blokken 3386/3388 met eigen vervangers 3387/3389: DELETE van blok 3388 soft-delete alleen 3389, 3387 blijft ongemoeid. Verlopen blok 3444 op een opgehaald… |
| BUG-119 | HIGH | NOT FIXED | generate/:id en generate-default/:id geven nu 400 op placeholder 3334 en blok 3335, maar GET /api/contracts/data/3334 geeft nog 200 met licensePlate/brand/mode… |
| BUG-120 | HIGH | FIXED | Voertuig 1754 op not_for_rental met booked 3301: POST /pickup met contractNumber -> 409 en de rij is onaangeroerd (status booked, contract_number null, pickup_… |
| BUG-121 | HIGH | FIXED | POST /api/reservations/maintenance-with-spare met twee toewijzingen op dezelfde reserveauto met overlappende datums -> 409 CONFLICT en nul blokken/vervangers w… |
| BUG-122 | MEDIUM | FIXED | Vijf rondes van twee gelijktijdige PATCHes op voertuig 1789 (remarks vs tireSize): 0 van de 5 rondes verliest een update, beide kolommen dragen elke ronde de n… |
| BUG-123 | MEDIUM | FIXED | POST /api/vehicles/bulk-import-plates met ['', ' ', null, 12345, {licensePlate:'x'}] -> imported [] en vijfmaal 'License plate is required'; select * from vehi… |
| BUG-124 | MEDIUM | FIXED | bulk-import-csv: apkDate '05-03-2027' -> apk_date 2027-03-05, companyDate '31-12-2026' -> 2026-12-31, productionDate '2020' -> 2020-01-01; '2026-02-30' wordt p… |
| BUG-125 | MEDIUM | NOT FIXED | POST /api/vehicles met barcode 'P36C-A' (het kenteken van voertuig 1670) -> 201 en de waarde wordt letterlijk opgeslagen; GET /api/barcodes/P36C-A resolvet daa… |
| BUG-126 | MEDIUM | FIXED | Voertuig 1699 verwijderd, zijn barcode VEH-001699 via SQL op voertuig 1677 gezet, restore -> 409 {"code":"BARCODE_TAKEN","message":"Another vehicle already use… |
| BUG-127 | MEDIUM | NOT FIXED | PATCH returnMileage onder de pickupstand -> 400 (goed), maar PATCH /api/reservations/3306 {returnMileage:39500} geeft 200 terwijl vehicles.current_mileage op 3… |
| BUG-128 | MEDIUM | FIXED | Reservering 3333, gepland end_date 2026-09-15: na pickup + return en daarna PATCH /status {picked_up} -> 200 en end_date is nog steeds 2026-09-15 in plaats van… |
| BUG-129 | MEDIUM | CHANGED BY DECISION | B-02: legacy rij 2175 met status 'active' gaat via PATCH /api/reservations/2175/status {completed} nu naar 200 (voorheen door geen enkele UI-actie te wijzigen)… |
| BUG-130 | MEDIUM | FIXED | Voertuig 1756 stond 'rented' met een boeking over 10 dagen: PATCH /api/reservations/3304/status {completed, departureMileage} -> voertuig gaat naar 'scheduled'… |
| BUG-131 | MEDIUM | FIXED | POST /pickup {pickupDate:'x'} -> 400 'Use a real yyyy-MM-dd date'; POST /return {returnDate:'x'} -> 400; returnDate vóór de ophaaldatum -> 400 'The return date… |
| BUG-132 | MEDIUM | NOT FIXED | Opgehaalde verhuur 3309: PATCH /status {cancelled} -> 200 en DELETE /api/reservations/3309 -> 200 (soft delete), beide zonder statusguard of overridepad; er is… |
| BUG-133 | MEDIUM | FIXED | PATCH /api/reservations/3313/basic {driverId:161} sluit toewijzing 289 (driver 23, assigned_until gezet) en opent rij 290 (driver 161) in reservation_driver_as… |
| BUG-134 | MEDIUM | NOT FIXED | B-06 vraagt om een melding bij datum-/voertuigwijziging en bij annulering, maar PATCH endDate, PATCH vehicleId, PATCH /status {cancelled} en DELETE op reserver… |
| BUG-135 | MEDIUM | FIXED | PATCH /api/transports/44 {vehicleId:1781}: voertuig 1778 gaat terug naar maintenance_status 'ok' met lege notitie, 1781 krijgt 'needs_service' + 'Replacement v… |
| BUG-136 | MEDIUM | FIXED | PATCH /api/transports/44 {status:'garbage_status'} -> 400 INVALID_TRANSPORT_STATUS met allowed-lijst; {status:'completed'} zonder completedDate zet completed_d… |
| BUG-137 | MEDIUM | FIXED | TBD-transport 48 afronden zet placeholder 3326 op status 'cancelled' (placeholder_spare false); GET /api/placeholder-reservations/needing-assignment bevat hem … |
| BUG-138 | MEDIUM | FIXED | POST /api/portal-requests/583/approve met een startDate een week in het verleden -> 400 MAINTENANCE_IN_PAST; goedkeuren op de inmiddels geannuleerde verhuur 33… |
| BUG-139 | MEDIUM | CHANGED BY DECISION | B-13: PATCH /api/reservations/3367 {vehicleId:1826} laat blok 3368 op het fysieke voertuig 1824 staan, de gekoppelde vervanger vervalt (0 live replacement-rije… |
| BUG-140 | MEDIUM | CHANGED BY DECISION | B-15: DELETE /api/transports/47 -> 204 en GET /api/deleted-records bevat entityType 'transport' (record 40, 'Transport #47 — P36T64813O3 2027-04-10'); restore … |
| BUG-141 | MEDIUM | FIXED | Twee gelijktijdige POST /api/portal-requests/581/approve: één 200 en één 409 {"code":"ALREADY_HANDLED","message":"Request is already closed"}; precies één onde… |
| BUG-142 | MEDIUM | FIXED | POST /api/transports met een vervanger die die dag al verhuurd is -> 409 'Replacement vehicle has conflicting reservations for this date' en select id from veh… |
| BUG-143 | MEDIUM | NOT FIXED | Het createpad is dicht (POST /api/reservations en een maintenance_block met vehicleId 98765432 -> beide 404 'Vehicle not found'), maar de oude weesrijen leven:… |
| BUG-144 | MEDIUM | NOT FIXED | PATCH /api/reservations/3318 {status:'picked_up'} -> 200 en PATCH /:id/status {picked_up} -> 200 op een reservering die pas op 2026-11-11 begint; de rij staat … |
| BUG-145 | MEDIUM | FIXED | cleanupPortalTestData verwijdert reserveringen nu ook via de test-voertuig-id's en de suite wijst naar een eigen database (server/__tests__/setup.ts:14 noemt l… |
| BUG-146 | LOW | FIXED | PATCH /api/vehicles/1675 {availabilityStatus:'needs_fixing'} op een voertuig met een booked reservering -> 200 en de responsbody bevat de sleutel 'warning'. |
| BUG-147 | LOW | FIXED | Voor voertuig 1696 bevat audit_logs precies één vehicle.delete-rij (id 1631) voor de DELETE, en de restore is gelogd als een eigen actie vehicle.restore (id 16… |
| BUG-148 | LOW | NOT FIXED | Twee van de vier regressie-asserts falen: POST /api/reservations met driverId 98765432 -> 400 'Failed to create reservation' en PATCH /:id {driverId:98765432} … |
| BUG-149 | LOW | NOT FIXED | PATCH /api/vehicles/1670 {serviceIntervalKm:-5, serviceIntervalMonths:0} -> 400 'The interval must be greater than zero' (goed), maar {lastServiceDate: vandaag… |
| BUG-150 | LOW | NOT FIXED | Er is nog geen purge: DELETE /api/deleted-records/purge en /api/deleted-records/1/purge vallen terug op de SPA-HTML, en server/routes.ts kent alleen GET /api/d… |
| BUG-151 | LOW | CHANGED BY DECISION | B-15: DELETE /api/reservations/3339 -> GET /api/deleted-records bevat 'Reservering #3339 — P36X23272RB 2027-07-29' (record 42); met een inmiddels overlappende … |
| BUG-152 | LOW | FIXED | audit_logs voor reservering 3314 na pickup en return: acties reservation.create, reservation.pickup (details.operation 'pickup') en reservation.return (details… |
| BUG-153 | LOW | NOT FIXED | Reservering 3315 van 2026-12-21 t/m 2026-12-25: GET /api/contracts/data/3315 geeft "duration":"4 days", GET /api/reports/vehicle-financials?from=2026-12-21&to=… |
| BUG-154 | LOW | FIXED | Voertuig 1876 met portaalblok 3429: PATCH /api/vehicles/1876/maintenance-status {status:'in_service'} zet het blok op maintenance_status 'in' en schrijft porta… |
| BUG-155 | LOW | FIXED | Een portaalgoedkeuring met onbereikbare mail geeft 200 met mailSent:false en schrijft email_logs-rijen 33-36 met result 'failed' en failure_reason 'No valid em… |
| BUG-156 | LOW | FIXED | POST /api/delivery/transports/generate-report {transportIds:[44], templateId:999999} -> 404 'Transport report template not found' en geen documentrij. |
| BUG-157 | LOW | NOT FIXED | Pickup met contractNumber '992899' -> 200 en daarna een pickup met '0992899' -> 200; select id,contract_number geeft beide rijen naast elkaar (3316 '992899', 3… |
| BUG-158 | LOW | FIXED | Twee gelijktijdige POST /api/placeholder-reservations/3358/assign-vehicle met verschillende voertuigen: één 200 en één 409 {"code":"CONFLICT","message":"This p… |
| BUG-159 | CRITICAL | FIXED | Twee parallelle PATCH /api/reservations/:id naar voertuig 1843 (2027-01-10..15): 200 + 409 CONFLICT, precies 1 booked-rij op het doelvoertuig; idem op /:id/bas… |
| BUG-160 | HIGH | FIXED | Twee gelijktijdige assign-spare-claims op spare 1866 voor dezelfde periode: 200 + 409 CONFLICT, exact 1 replacement-reservering (3414) op de spare (p36d-12-con… |
| BUG-161 | HIGH | NOT FIXED | 20 parallelle foute logins op AUDIT-P36D-lock1, elk vanaf een eigen X-Forwarded-For: 10x401 "Incorrect password" (volledige wachtwoordverificatie) + 10x429, tw… |
| BUG-162 | HIGH | FIXED | GET /api/contracts/generate/3230?templateId=3 (klant 1258 met emoji/CJK/RTL in naam, adres en telefoon): 200 PDF waarvan de paginatekst de huurdersnaam bevat (… |
| BUG-163 | HIGH | NOT FIXED | Technisch weg (generateFallbackContract verwijderd in ee037093; GET /api/contracts/generate/3230?templateId=999999 -> 404 "Template not found", geen documents-… |
| BUG-164 | HIGH | FIXED | De legacygenerator bestaat niet meer: `git diff main..HEAD -- server/utils/pdf-generator.ts` toont de verwijdering van `generateRentalContract` en `generateFal… |
| BUG-165 | HIGH | FIXED | GET /api/contracts/generate-default/3228 -> 200 + documents-rij 206 (Contract (Unsigned), content_type application/pdf, version 2); GET /api/damage-checks/gene… |
| BUG-166 | HIGH | FIXED | Schadecheck voor klant 1255 (alleen `name`, first/last NULL): paginatekst bevat "AUDIT-P36D Normal Customer" en nergens "null null" (p36d-01-pdf.out.json A6, p… |
| BUG-167 | HIGH | NOT FIXED | Gebruiker AUDIT-P36D-limited (rol user, permissies [view_vehicles]) krijgt nog steeds 200 op GET /api/contracts/generate/3228, GET /api/contracts/generate-defa… |
| BUG-168 | HIGH | FIXED | POST /api/damage-check-templates/preview-pdf met page:40000 -> 400 in 10 ms ({"path":"0.page","message":"Number must be less than or equal to 10"}); PUT /api/d… |
| BUG-169 | HIGH | FIXED | Met UPLOADS_DIR buiten de repo: POST /api/customers/1255/drivers (licenseFile) -> 201, drivers.license_file_path = "drivers/license_customer1255_...jpg" (geen … |
| BUG-170 | HIGH | NOT FIXED | POST /api/notifications/send {vehicleIds:[1883],template:"apk"} -> 200 {sent:3}; de SMTP-stub ving 3 berichten: de huidige houder (audit-p36d-now), een terugge… |
| BUG-171 | HIGH | FIXED | SMTP-stub op 127.0.0.1:2537 in modus hang-ehlo: de bulkverzending voor 3 ontvangers keerde na 30,1 s terug (3 x de 10 s SMTP_TIMEOUT_MS uit server/utils/email-… |
| BUG-172 | MEDIUM | NOT FIXED | Twee sessies lezen reservering 3410; A PATCHt de hele rij met nieuwe notes -> 200 (DB: notes=AUDIT-P36D NOTES-FROM-A), B PATCHt daarna zijn verouderde kopie me… |
| BUG-173 | MEDIUM | FIXED | Dezelfde maintenance-with-spare-body tweemaal gelijktijdig op voertuig 1873: 201 + 409 CONFLICT; DB toont exact 1 maintenance_block (3424) en exact 1 vervangin… |
| BUG-174 | MEDIUM | FIXED | Twee parallelle POST /api/reservations/3415/pickup met verschillende contractnummers: 200 + 400 "Cannot pickup reservation with status: picked_up"; DB houdt co… |
| BUG-175 | MEDIUM | FIXED | PUT /api/system-settings vanuit twee sessies -> 200 + 409; PATCH /api/pdf-templates/3 met de exacte updated_at -> 200 (A), de verouderde kopie (B) -> 409 STALE… |
| BUG-176 | MEDIUM | FIXED | preview-pdf: damageTypes met emoji -> 200 geldige PDF (geen 500), damageTypes [42,null,{}] -> 400 met veldfouten, gemengde rommel ([{type:unknownType},{zonder … |
| BUG-177 | MEDIUM | FIXED | 1:1 headerafbeelding (600x600) geupload en schadecheck gegenereerd: de enige tekstitems in de headerband (y>772) zijn de overlay "12/09/2026" (y=820, h=8) en "… |
| BUG-178 | MEDIUM | FIXED | Contract voor klant 1257 (naam/adres 250 tekens, merk/model 300) en transportrapport voor transport 35 (bestemming/reden/notities extreem lang): pdfjs meldt 0 … |
| BUG-179 | MEDIUM | NOT FIXED | Deel gefixt (corrupte of ontbrekende achtergrond -> 500 i.p.v. stille standaard; JPEG-bytes met .png-naam -> 400), maar: POST /api/pdf-templates/4/backgrounds/… |
| BUG-180 | MEDIUM | FIXED | Upload van een 3-pagina-PDF met catalog /OpenAction -> /JavaScript als sjabloonachtergrond wordt geweigerd: 400 "This PDF contains document-level JavaScript or… |
| BUG-181 | MEDIUM | NOT FIXED | (b) generate-report met templateId 999999 -> 404 en (c) de schadecheckroutes kiezen hetzelfde sjabloon, maar (a) is onveranderd: na is_default=false op alle pd… |
| BUG-182 | MEDIUM | FIXED | POST /api/contracts/generate-versioned/999999?templateId=3 -> 404 "Reservation not found" zonder documents-rij; dezelfde route op reservering 3228 met vreemd v… |
| BUG-183 | MEDIUM | NOT FIXED | Eerste helft gefixt (voertuig 1690 met alleen een reservering uit 2020: GET /api/vehicles/1690/damage-check-pdf geeft paginatekst "AUDIT-P36D DC AU3D7X 12/09/2… |
| BUG-184 | MEDIUM | FIXED | Twee POST /api/documents (documentType=contract, vehicleId 1683, zelfde dag) -> 201 id 266 met filePath contracts/AU3D0X/AU3D0X_contract_20260912_1789240181794… |
| BUG-185 | MEDIUM | NOT FIXED | Twee identieke POST /api/notifications/send gelijktijdig -> beide 200 {sent:3}; de SMTP-stub ving 6 berichten (elke ontvanger twee keer) en er ontstonden 8 ema… |
| BUG-186 | MEDIUM | FIXED | Config met smtpSecure:true op de plaintextpoort 2536 opgeslagen: de verzending faalt ({sent:0,failed:3}) en de stub ving 0 berichten, dus er gaat niets meer in… |
| BUG-187 | MEDIUM | FIXED | Portaalgebruiker 30 zette fullName op 'AUDIT-P36D <a href="https://evil.example/login">...</a>'; opgeslagen waarde bevat geen markup meer en de staff-meldingsm… |
| BUG-188 | LOW | FIXED | Twee parallelle DELETE /api/vehicles/1871 (met confirmLicensePlate): 200 + 404 "Vehicle not found"; deleted_records bevat precies 1 snapshot (id 53, related_co… |
| BUG-189 | LOW | FIXED | Twee parallelle POST /api/users/change-password met hetzelfde huidige en verschillende nieuwe wachtwoorden: 400 "Current password is incorrect" + 200; daarna l… |
| BUG-190 | LOW | FIXED | Vijf gelijktijdige GET /api/contracts/generate/3228?templateId=3 -> 5x200 en documents-rijen 208-212 met 5 verschillende file_paths (..._2026-09-12T19-02-29-30… |
| BUG-191 | LOW | FIXED | Sjabloon 5 met velden source nonexistentSource (naam SHOULD-NOT-PRINT-...), __proto__, vehicleId, foo.bar en zonder source: aanmaken 201, GET /api/contracts/ge… |
| BUG-192 | LOW | NOT FIXED | B-18 besluit "altijd Nederlands, dd-mm-jjjj, bedragen met een komma" is niet geimplementeerd: het contract voor reservering 3228 drukt "September 13, 2026" / "… |
| BUG-193 | LOW | FIXED | POST /api/pdf-templates/3/background met een tekst-PDF op Windows -> 200 met backgroundPreviewPath templates/template_3_background_preview.png; het bestand bes… |
| BUG-194 | LOW | NOT FIXED | Deel gefixt (PATCH /api/pdf-templates/:id met fields "{oops" of een 2 MB-string -> 400 i.p.v. 404; generate-versioned met vehicleId {$gt:0} -> 400; interactive… |
| BUG-195 | LOW | FIXED | Document 268 geupload en het bestand daarna van schijf verwijderd: GET /api/documents/view/268 en /download/268 -> 404, en zowel GET /api/documents/268 als GET… |
| BUG-196 | LOW | FIXED | Portaalaanvraag 588: custom_notifications.link = "/portal-admin?request=588" en de staff-mail bevat <a href="https://portaal.lamgroep.nl/portal-admin?request=5… |
| BUG-197 | CRITICAL | FIXED | e-backups3: a full-size dump with an injected `SELECT 1/0;` -> 500 {"error":"The restore failed and was rolled back; the database was not changed. psql exited … |
| BUG-198 | HIGH | FIXED | e-backups2: with UPLOADS_DIR=regress-uploads I deleted regress-uploads/documents/1682/damage_check/P36W01_...pdf, then POST /api/backups/restore/files -> 200 "… |
| BUG-199 | HIGH | FIXED | e-backups3: a full-size dump with `\connect lvs_regress_other` -> 400 "Refusing to restore: the dump contains \connect, which can act outside the database bein… |
| BUG-200 | HIGH | FIXED | e-backups2: POST /api/backups/upload (type=database) -> 200; the file appeared as C:\...\regress-backups\uploaded-database-2026-09-12T19-07-36-642Z-AUDIT-P36E-… |
| BUG-201 | HIGH | FIXED | Browser at 127.0.0.1:5003/reservations with SQL fixtures 3446 (end_date 'not-a-date') and 3447 ('2099-13-45') present: the page rendered, no ErrorBoundary fall… |
| BUG-202 | HIGH | FIXED | e-api: multipart PATCH /api/reservations/3396 carrying driverId/replacementForReservationId/replacementForTransportId/affectedRentalId/portalRequestId/delivery… |
| BUG-203 | HIGH | FIXED | e-sqlcount on :5003: the 5-week grid 2026-08-31..10-04 (331 rows) = 11 statements, 1-year range (1724 rows) = 11 statements (was 924 / 3774); per-table scan de… |
| BUG-204 | HIGH | FIXED | calendar.tsx now has exactly one key for the full list (`queryKey: ['/api/reservations']` at :645); the second key ['/api/reservations', vehicles?.length] is g… |
| BUG-205 | HIGH | NOT FIXED | e-api/e-perf on :5003: GET /api/reservations = 1949-1984 rows, 7 590 852-7 736 798 bytes (3 895 B per row, unchanged shape); item[0] still embeds the full vehi… |
| BUG-206 | MEDIUM | FIXED | e-backups: os.tmpdir() held zero db-backup-*/files-backup-*/restore-* entries before and after three POST /api/backups/run (newTempFiles = []), and still zero … |
| BUG-207 | MEDIUM | FIXED | e-backups2/e-backups3: after four refused restores and one successful restore, `walk(BACKUP_PATH) filter /\.sql$/` = [] — no plaintext dump beside any archive … |
| BUG-208 | MEDIUM | FIXED | e-backups2: POST /api/backups/restore/complete with a valid DB archive and a corrupt files archive -> 400 {"error":"Refusing to restore: the files archive is u… |
| BUG-209 | MEDIUM | NOT FIXED | Half fixed: GET /api/backups/download-data -> 200, 20 456 897 bytes, contains DROP TABLE IF EXISTS and zero `OWNER TO` lines, and leaves no new file under <cwd… |
| BUG-210 | MEDIUM | NOT FIXED | Browser at viewport 1182x698 on /reservations: document.documentElement.scrollWidth = 1418 vs clientWidth 1167-1182 (originally 1416 vs 1166) — the named regre… |
| BUG-211 | MEDIUM | CHANGED BY DECISION | Decision B-16 (docs/audit/besluiten.md:100). e-api2 on reservation 3397 (startDate 2026-10-22): POST /pickup without an answer -> 409 {"code":"PICKUP_BEFORE_ST… |
| BUG-212 | MEDIUM | NOT FIXED | Two of the three named expectations landed: a global QueryCache onError toast fires (observed live after login: "Could not load the data / Failed to execute 'j… |
| BUG-213 | MEDIUM | FIXED | Browser: with the tab logged in I killed the session from a second client (POST /api/logout -> 200), then clicked "Voertuigen" in the sidebar — the tab went to… |
| BUG-214 | MEDIUM | NOT FIXED | Decision B-19 says compression must be on in the application itself; it is not. `curl`-equivalent raw fetch with `Accept-Encoding: gzip` to GET /api/vehicles r… |
| BUG-215 | MEDIUM | FIXED | e-api: GET /api/damage-checks/generate/3398 -> 200, 5 615 / 5 619 / 5 619 bytes in 372 / 96 / 109 ms (was 3 465 695 bytes at p50 581 ms). Blocking probe: while… |
| BUG-216 | MEDIUM | FIXED | e-api: GET /api/interactive-damage-checks -> 14 rows, 4 408 bytes (was 17 043 541), and the item keys are id,vehicleId,reservationId,checkType,checkDate,diagra… |
| BUG-217 | MEDIUM | FIXED | e-perf: pg_stat_user_tables.n_tup_upd on `vehicles` moved by 0 across 3 repetitions each of GET /api/vehicles (200, ~55 ms) and GET /api/vehicles/status/breakd… |
| BUG-218 | MEDIUM | FIXED | e-api: POST /api/vehicles with a 2 MB JSON body -> 413 "request entity too large" in 16 ms, and with a 20 MB body -> 413 in 91 ms — rejected by the body parser… |
| BUG-219 | LOW | NOT FIXED | The restore half is fixed: on this Windows host POST /api/backups/restore/database, /restore/files, /restore-files and /restore-data all completed (200 or a de… |
| BUG-220 | LOW | FIXED | e-backups2: the created archive no longer carries backup_runs data (`COPY public.backup_runs` absent from the 20 404 729-byte dump; pg_dump now runs --exclude-… |
| BUG-221 | LOW | FIXED | All six points: (a) two concurrent POST /api/backups/run -> [200, 409] with {"error":"A backup is already running...","retryAfterSeconds":60} and header retry-… |
| BUG-222 | LOW | FIXED | Browser at 768x1024 on /vehicles: the sidebar is a hamburger drawer (screenshot), the page does not scroll horizontally (documentElement.scrollWidth 753 == cli… |
| BUG-223 | LOW | FIXED | All six documented items are Dutch now, checked in the live UI: empty vehicle search -> "Geen resultaten.", "0 van 0 getoond", "Vorige", "Volgende"; /portal ->… |
| BUG-224 | LOW | NOT FIXED | The code path is NOT fixed for new rows. A document generated at 21:18:26 CEST (19:18:26 UTC) stored `2026-09-12 21:18:26.112472` in documents.upload_date, the… |
| BUG-225 | LOW | FIXED | Browser: opened "Nieuwe reservering", typed "AUDIT-P36E dirty form text" into the notes textarea and set startDate, then dispatched pointerdown/mousedown/mouse… |
| BUG-226 | LOW | FIXED | e-api: GET /api/reservations/find-by-contract/AUDIT-P36C-Q40430-1 -> 200 in 25.6 ms, 4 450 bytes (one row), 2 statements, 0 sequential scans of `reservations` … |
| BUG-227 | LOW | FIXED | code-inspectie plus runtime: getReservationsInDateRange in server/database-storage.ts now contains 0 console.* calls (the four-lines-per-maintenance-block logg… |
| BUG-228 | LOW | NOT FIXED | Partly remediated, two named symptoms unchanged. Fixed: the per-vehicle-cell filter is now a useMemo bucket map (calendar.tsx:947-955, getReservationsForDay re… |
| BUG-229 | LOW | FIXED | client/src/lib/query-key-match.ts replaces the substring test with a whole-path-segment match (the id must be followed by end, '/', '?' or '#') and every cache… |
| BUG-230 | LOW | NOT FIXED | Two of the three named sites fixed, one unchanged. Fixed: service-due-scanner.ts:106-107 loads the fleet once and hands it to getServiceDueVehicles({settings, … |