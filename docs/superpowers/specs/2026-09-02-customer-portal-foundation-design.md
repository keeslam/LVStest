# Customer Portal — Part 1: Foundation

Date: 2026-09-02
Status: Approved for planning

## Context

Lam Groep wants a customer portal that business customers reach from the public
website (lamgroep.nl, WordPress). Customers should be able to rent a vehicle from
the ones offered online, see their reservations, contracts and fines, keep track
of which driver is using which vehicle, and ask questions. Staff must be notified
by e-mail when something happens in the portal, must control which vehicles are
offered, and must be able to manage every customer account and see what each
customer needs.

The whole programme is decomposed into four parts, each with its own spec, plan
and implementation cycle:

1. **Foundation** (this spec) — customer accounts, login, iframe embedding,
   read-only reservations and contracts, driver management with assignment
   history, per-customer feature switches, staff-side account management,
   the "offered online" vehicle flag and its management screen.
2. **Online booking** — booking request flow in the portal, availability check
   per period, staff approve/reject, e-mail notification.
3. **Fines** — fines table, staff entry with letter upload, automatic
   attribution to reservation and driver via the assignment history, portal view.
4. **Requests** — typed requests (extension, early return, damage report,
   question) with status, staff inbox, replies visible in the portal.

The data model in this spec already anticipates parts 2–4 so they do not need
to restructure it.

## Decisions taken

- **The portal is part of this application**, not a WordPress plugin. It is
  served as React routes under `/portaal/*` with an API under `/api/portal/*`.
  WordPress embeds it in an `<iframe>` and otherwise only links to it. There is
  one source of truth and nothing is synchronised.
- **Deployment requirement:** the portal must be served from a sub-domain of the
  website, e.g. `portaal.lamgroep.nl`, so that `lamgroep.nl` and the portal are
  *same-site*. Browsers (Safari fully, Chrome increasingly) drop third-party
  cookies inside iframes; a same-site sub-domain avoids that. Locally the site
  runs at `lamgroep.local`, so the allowed frame origins are configurable.
- **Accounts are separate from staff users.** A new `portal_users` table with
  its own Passport strategy and its own session cookie. Existing `users`,
  permissions and routes stay untouched. Rejected alternatives: a `customer`
  role in `users` (every existing permission check would need to exclude
  customers — one miss leaks staff data), and a separate repository (double DB
  layer, double deploy).
- **Multiple logins per customer, with roles.** `admin` can do everything the
  customer's switches allow; `driver` is tied to one `drivers` row and only sees
  reservations they are or were the driver of.
- **No self-registration.** Staff create accounts; the customer receives an
  invitation e-mail and chooses a password.
- **Per-customer feature switches** that staff can turn off for a specific
  customer (explicitly requested for requests, applied to every portal feature).
- **Booking is a request** that staff confirm (part 2). Vehicles shown are those
  with a manual "offered online" flag that are free in the chosen period (part
  2); the flag and its management screen are built in part 1.
- **Fines are entered by staff and attributed automatically** to the driver via
  the assignment history (part 3), which is why part 1 records driver changes
  with timestamps.

## Data model

All new tables live in `shared/schema.ts` next to the existing ones and follow
the existing conventions (serial ids, `created_at`/`updated_at`, `created_by`
text columns, drizzle-zod insert schemas).

### `portal_users`

| column | type | notes |
|---|---|---|
| id | serial PK | |
| customer_id | integer FK customers, cascade delete | |
| email | text, unique (case-insensitive index on `lower(email)`) | login name |
| password_hash | text, nullable | null until the invitation is accepted; same scrypt format as `users.password` via `hashPassword` in `server/auth.ts` |
| full_name | text | |
| role | text, `admin` \| `driver` | |
| driver_id | integer FK drivers, set null | required when role = `driver`; must belong to the same customer |
| active | boolean default true | |
| invite_token_hash | text, nullable | sha256 of the token in the e-mail link; used for both invitation and password reset |
| invite_expires_at | timestamp, nullable | 72 hours after sending |
| last_login_at | timestamp, nullable | |
| created_at, updated_at, created_by, updated_by | as elsewhere | `created_by` is the staff username |

A user with `active = false`, or whose customer has `status` marking them
inactive, cannot log in and existing sessions are rejected.

### `portal_customer_settings`

One row per customer, created on first account creation with all switches on.

| column | type |
|---|---|
| id | serial PK |
| customer_id | integer FK customers, cascade, unique |
| can_book | boolean default true (used by part 2) |
| can_manage_drivers | boolean default true |
| can_submit_requests | boolean default true (used by part 4) |
| can_view_fines | boolean default true (used by part 3) |
| can_view_contracts | boolean default true |
| show_prices | boolean default false |
| internal_notes | text — staff-only free text: what this customer needs, agreements |
| created_at, updated_at, updated_by | |

A switch that is off makes the corresponding API return `403` **and** hides
the tab in the portal. The API check is the authority; the UI merely follows.

### `reservation_driver_assignments`

History of who was assigned to a reservation and when.

| column | type |
|---|---|
| id | serial PK |
| reservation_id | integer FK reservations, cascade |
| driver_id | integer FK drivers, set null |
| assigned_from | timestamp not null |
| assigned_until | timestamp, nullable — null means current |
| assigned_by_portal_user_id | integer FK portal_users, set null |
| assigned_by_user_id | integer FK users, set null |
| note | text |
| created_at | |

Index on `(reservation_id, assigned_from)`. Exactly one open row (null
`assigned_until`) per reservation at any time; the storage method that assigns
a driver closes the previous open row and opens the new one in one transaction,
and also writes `reservations.driver_id` so every existing staff screen keeps
working. Staff changing the driver in the reservation dialog goes through the
same storage method, so the history is complete regardless of who changed it.
Existing reservations get one back-filled row at migration (`assigned_from =
start_date`) when they have a `driver_id`.

Part 3 will answer "who drove licence plate X at time T" with: reservation on
that vehicle covering T → assignment row covering T.

### `portal_activity_log`

| column | type |
|---|---|
| id | serial PK |
| portal_user_id | integer FK portal_users, set null |
| customer_id | integer FK customers, cascade |
| action | text — `login`, `logout`, `login_failed`, `activate`, `password_reset`, `driver_created`, `driver_updated`, `driver_assigned`, `document_downloaded`, later `booking_requested`, `request_submitted` |
| entity | text, nullable — `reservation`, `driver`, `document` |
| entity_id | integer, nullable |
| details | jsonb, nullable |
| ip | text |
| created_at | |

Staff see this per customer and globally. This is separate from `audit_logs`,
which records staff actions.

### Changes to existing tables

- `vehicles.offered_online` boolean default false, `vehicles.online_description`
  text nullable. Part 2 filters on `offered_online = true`.
- `UserPermission` gains `MANAGE_PORTAL` (accounts, settings, online vehicles)
  and `VIEW_PORTAL` (read-only view of accounts and activity). `admin` and
  `manager` roles get both by default.

### Migration

`npm run db:push` for development; the commit body carries the equivalent SQL
(pattern of commits `e3cc8d4d` and `911891f5`). `startup-migration.js` adds the
new columns and tables idempotently so a production database that does not use
drizzle push also gets them, and performs the one-off back-fill of
`reservation_driver_assignments`.

## Authentication and session

- New file `server/portal-auth.ts`. Passport strategy named `portal-local`
  (e-mail + password). Staff `local` strategy is not touched.
- A second `express-session` middleware is mounted only on `/api/portal` with
  cookie name `portal.sid`, `sameSite: 'lax'`, `secure` via the existing
  `useSecureCookies()`, same Postgres session store table with a different
  cookie name (rows are distinguished by their session id; no schema change).
  The staff cookie stays `strict`. `lax` is what allows the first navigation
  into the iframe to carry the cookie; because portal and site are same-site,
  every request after that carries it too.
- `req.portalUser` is set by `requirePortalUser` middleware: loads the user,
  verifies `active`, verifies the customer is not inactive, loads
  `portal_customer_settings`, attaches `{ user, customerId, settings }`. Every
  portal route uses it; there is no portal route without it except login,
  activate, forgot and reset.
- Serialisation into the session stores `{ kind: 'portal', id }`; the staff
  deserialiser ignores objects with `kind: 'portal'` and vice versa so a session
  id can never be interpreted by the wrong side.
- Rate limiting and lockout reuse `server/middleware/security/rateLimiter.ts`
  with the key prefixed `portal:` so a customer's failed attempts do not lock a
  staff account with the same e-mail and the counters stay separate.
- CSRF uses the same double-submit pattern as staff with its own token endpoint
  `GET /api/portal/csrf-token`.
- Invitation and password reset: staff (or "forgot password" from the login
  page) triggers `sendPortalInvite`. A 32-byte random token is generated, its
  sha256 stored in `invite_token_hash`, expiry 72 hours, and a link
  `<portalBaseUrl>/portaal/activeren?token=…` is mailed via the existing
  `sendEmail` with an `email_templates` entry (`portal_invite`,
  `portal_password_reset`) that staff can edit. Consuming the token sets the
  password, clears the token and logs the user in. Expired or unknown token
  shows a clear message with a "request a new link" action that only reveals
  success, never whether the e-mail exists.
- "Forgot password" from the login page is rate limited per e-mail and per IP.

## Iframe embedding

- For requests whose path starts with `/portaal` or `/api/portal`, the security
  headers middleware sets
  `Content-Security-Policy: frame-ancestors 'self' <allowed origins>` and does
  **not** set `X-Frame-Options`. All other paths keep the current `SAMEORIGIN`
  behaviour.
- Allowed origins come from `app_settings` key `portal_config`
  (`{ allowedFrameOrigins: string[], notificationEmail: string, portalBaseUrl: string }`),
  cached with the same invalidation pattern as the e-mail config. Default
  `https://lamgroep.nl`, `https://www.lamgroep.nl`; locally staff add
  `http://lamgroep.local`.
- The portal page posts `{ type: 'lamgroep-portal:height', height }` to
  `window.parent` via `postMessage` whenever its document height changes, so the
  WordPress side can size the iframe without a scrollbar. The WordPress snippet
  (a few lines of JS on the "Klantenportaal" page) is documented in the spec's
  appendix and is the only thing that lives on the website.
- Links inside the portal never use `target="_top"`; everything stays in the
  frame. Downloads open in a new tab (`target="_blank"`) so the frame is not
  navigated away.

## Portal UI

Routes under `/portaal/*` in `client/src/App.tsx`, rendered inside a new
`PortalLayout` (`client/src/layouts/PortalLayout.tsx`) instead of `MainLayout`.
Pages live in `client/src/pages/portal/`. A `PortalAuthProvider` (own React
Query key space `['portal', …]`) supplies the current user and settings.
Components reuse the existing shadcn/ui library and i18n; language follows
`customers.preferred_language`.

The layout is deliberately minimal: company name, user name, language, logout,
horizontal tabs. Tabs are rendered from the settings switches and the user's
role. No staff navigation, no dashboard widgets.

Pages in part 1:

- **Login** `/portaal/login` — e-mail, password, "forgot password".
- **Activate / reset** `/portaal/activeren` — choose password (min 10 chars,
  same rules as staff), then redirected to overview.
- **Overview** `/portaal` — current rentals (vehicle, licence plate, driver,
  since), upcoming reservations, and tiles for the enabled sections.
- **Reservations** `/portaal/reserveringen` and `/portaal/reserveringen/:id` —
  list and detail: period, vehicle, driver, status, pickup mileage, spare
  vehicle if any. Only `type = 'standard'` and `replacement` reservations linked
  to this customer's rentals; maintenance blocks are never returned. Role
  `driver` only sees reservations with an assignment row for their driver id.
- **Contracts** `/portaal/documenten` (switch `can_view_contracts`) — documents
  of this customer's reservations where `isContractDocument` or
  `isDamageCheckDocument` is true, grouped by reservation. Download through the
  portal API, never through the staff document route.
- **Drivers** `/portaal/bestuurders` (switch `can_manage_drivers`, role
  `admin`) — list of this customer's `drivers`, add, edit, deactivate (status
  `inactive`; no delete), licence upload to the existing `uploads/drivers`
  storage with the same file rules as the staff upload. Per current rental a
  "change driver" action that creates an assignment row.
- **Account** `/portaal/account` — name, change password.

The portal UI has no access to prices unless `show_prices` is on; the API omits
price fields entirely when it is off.

## Portal API

All under `/api/portal`, registered from `server/routes/portal.ts` via the same
`register…Routes(app, deps)` pattern as the other route groups. Storage methods
are added to `IStorage` / `DatabaseStorage` with a `portal` prefix and always
take `customerId` as a parameter so an ownership check cannot be forgotten.

| method | path | notes |
|---|---|---|
| GET | `/csrf-token` | |
| POST | `/login`, `/logout` | |
| POST | `/forgot` | always 200 |
| POST | `/activate` | token + password |
| GET | `/me` | user, customer name, settings switches, role |
| PATCH | `/me` | full name |
| POST | `/me/password` | current + new |
| GET | `/reservations`, `/reservations/:id` | scoped as described above |
| GET | `/documents` | grouped by reservation |
| GET | `/documents/:id/download` | 404 (not 403) when the document is not the customer's |
| GET/POST/PATCH | `/drivers`, `/drivers/:id` | `can_manage_drivers`, role admin |
| POST | `/drivers/:id/license` | multipart upload |
| POST | `/reservations/:id/driver` | `{ driverId, note }`; reservation must be this customer's and status `booked` or `picked_up` |

Every handler validates params with zod, uses `req.portalUser.customerId`, and
writes a `portal_activity_log` row for mutating actions and downloads.

## Staff side

- **Customer dialog, new "Portaal" tab** (`client/src/components/customers/…`,
  permission `VIEW_PORTAL` to see, `MANAGE_PORTAL` to change):
  - accounts of this customer: name, e-mail, role, linked driver, active, last
    login; actions invite, re-send invitation, send password reset, block /
    unblock, change role or linked driver, delete (only when never activated).
  - the six switches and the internal notes field.
  - last 50 activity log rows for this customer.
- **New page `/portal-admin`** (permission `MANAGE_PORTAL`, menu item
  "Klantenportaal"): tab *Accounts* — all portal users across customers with
  filters (customer, role, active, never activated) and the same actions; tab
  *Voertuigen online* — vehicle list with the `offered_online` toggle, an
  editable online description, filters, and bulk on/off; tab *Activiteit* —
  global activity log with customer filter.
- **Notifications**: a driver change by a customer creates a
  `custom_notifications` row (type `portal_driver_change`, link to the
  reservation) and sends an e-mail to `portal_config.notificationEmail` through
  `sendEmail` with template `portal_staff_notification`. This helper
  `notifyStaffOfPortalEvent(kind, payload)` in `server/services/portal-notifications.ts`
  is what parts 2 and 4 call for bookings and requests.
- **Settings card "Klantenportaal"** on the settings page: allowed frame
  origins, notification e-mail, portal base URL, links to the two e-mail
  templates.
- Staff API under `/api/portal-admin/*` (`server/routes/portal-admin.ts`),
  protected by `hasPermission(MANAGE_PORTAL)` / `VIEW_PORTAL`. Staff actions on
  accounts go through the existing `AuditLogger`.

## Error handling

- Portal API errors are returned as `{ error, code }` with stable codes the UI
  translates (`PORTAL_FEATURE_DISABLED`, `PORTAL_ACCOUNT_BLOCKED`,
  `PORTAL_TOKEN_EXPIRED`, …). Nothing in an error reveals whether an e-mail
  address exists.
- A blocked account or inactive customer gets a login-page message telling them
  to contact Lam Groep; the session is destroyed server-side.
- Mail failures on invitation are surfaced to staff in the dialog (the account
  is still created and the invitation can be re-sent); the existing
  `email_logs` records the attempt.
- If `portal_config` is missing, the portal still serves with the default frame
  origins and staff notifications are skipped with a logged warning.

## Testing

- Unit: driver assignment history (closing the previous row, single open row,
  `reservations.driver_id` kept in sync, back-fill), token hashing and expiry,
  settings-to-403 mapping, reservation scoping for role `driver`.
- API integration (supertest against a test database): login/activate/reset
  flow; customer A can never read or download customer B's reservation,
  document or driver (expect 404); disabled switch returns 403; staff session
  cannot call `/api/portal/*` and portal session cannot call staff routes;
  frame-ancestors header present only on portal paths.
- Browser: portal pages in the dev server, then embedded in an iframe on a page
  at `lamgroep.local` — login, tab navigation, height postMessage, download in a
  new tab.
- `npm run check` stays at zero errors.

## Out of scope for part 1

Booking flow and availability search (part 2), fines (part 3), requests and
messaging (part 4), a public vehicle feed for the website, customer
self-registration, two-factor authentication, and any change to how staff create
reservations.

## Appendix: WordPress embed snippet

The "Klantenportaal" page on the website contains:

```html
<iframe id="lamgroep-portal" src="https://portaal.lamgroep.nl/portaal"
        style="width:100%;border:0;min-height:600px" title="Klantenportaal"></iframe>
<script>
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://portaal.lamgroep.nl') return;
  if (e.data && e.data.type === 'lamgroep-portal:height') {
    document.getElementById('lamgroep-portal').style.height = e.data.height + 'px';
  }
});
</script>
```
