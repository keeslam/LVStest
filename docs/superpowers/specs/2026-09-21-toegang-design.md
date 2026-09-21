# Access on staff screens: no-access page, one page-permission table, disabled controls — design

Date: 2026-09-21. Branch: `fix/audit-remediation`. Sub-project A of the programme
that follows the desk review (`docs/e2e/werkstromen/01-balie.md`). Implements the
owner's decisions B-27, B-28 and B-29 (`docs/audit/besluiten.md`). The facts this
design rests on — every page with its queries and their server guards, and the 68
controls a user can see but not use — are in
`docs/superpowers/specs/2026-09-21-toegang-feiten.md` (read it; this spec does
not repeat its tables).

## Background

A role is only a label. Role `admin` bypasses every check
(`server/middleware/permissions.ts`); every other user has an explicit
`permissions` array. `client/src/hooks/use-has-permission.ts` mirrors that rule.
Today:

- `client/src/components/protected-route.tsx` checks the login only. A typed
  address of a screen without rights loads the page shell with empty data.
- The sidebar (`client/src/components/sidebar-nav.tsx`) holds the only list of
  "which permission shows which screen"; `e2e/registry/pages.ts` is a copy.
- 11 of the 13 screens fire at least one query guarded by another permission
  family than the screen's own (a reports-only account gets nothing, because no
  route accepts `view_reports`). With the owner's current accounts this is
  latent; an unusual mix of rights hits it.
- Every existing permission gate HIDES the control. 68 controls are shown to
  users whose action the server will refuse.

## Decisions (owner: Kees, 2026-09-21)

1. B-28: a typed address without rights shows a clear "U heeft geen toegang tot
   dit scherm".
2. B-29: menu and server are brought into line. Approved design: the screen's
   own permission decides whether the screen opens; a part of a screen that
   shows data from another permission family shows that data only when the
   user holds that permission too, otherwise a calm line "geen toegang tot deze
   gegevens" and no request; the server stays exactly as strict as it is.
   - Transport (`/delivery`): the screen is for everyone who may see
     reservations OR vehicles — the rule `GET /api/transports` already applies.
     That group gets the menu item.
   - Communication (`/communications`): the screen requires "e-mailsjablonen
     beheren" (`manage_email_templates`); the send buttons are disabled without
     "meldingen beheren" (`manage_notifications`).
   - Maintenance (`/maintenance`): the screen requires "onderhoud beheren".
3. B-27: controls a user may not use stay visible, greyed out and switched off,
   with an explanation. The MENU keeps hiding screens a user may not open (the
   decision was about buttons and tiles). Controls that are admin-only today
   (users, backup, settings, the vehicle recycle bin) stay hidden for
   non-admins.

## Non-goals

- No change to which rights any account holds, and no change to any server
  guard that would let someone read or do more than today, with one exception
  under "Server" below that is reported to the owner.
- No hints in the users dialog about rights that depend on each other.
- The customer portal (`/portaal`) is out of scope.
- The six parked questions of the desk review stay parked.

## 1. One table: screen → permission

New `shared/page-access.ts`:

```ts
export interface PageAccess { path: string; anyOf: readonly string[] }
export const PAGE_ACCESS: readonly PageAccess[];          // the 13 menu screens + the two without a menu entry
export function pageAccessFor(path: string): PageAccess | undefined;   // matches "/reservations/edit/12" to its pattern
export function canOpenPage(user: { role: string; permissions?: string[] | null } | null | undefined, path: string): boolean;
export function firstOpenablePage(user): string | null;   // in menu order; for the no-access page's way out
```

Entries are the sidebar's current ones, with these changes: `/delivery` →
`view_reservations | manage_reservations | view_vehicles | manage_vehicles`;
`/communications` → `manage_email_templates`; new `/reservations/edit/:id` →
`manage_reservations`; new `/expenses/add` → `manage_expenses`.

Consumers, so they can never drift again: `sidebar-nav.tsx` (takes `anyOf` from
the table, keeps its own labels and icons), the route guard (§2), and
`e2e/registry/pages.ts` (imports the table; keeps only its per-page `api`).

## 2. The no-access page (B-28)

`ProtectedRoute` gains the permission check. When the user is logged in but
`canOpenPage` is false it renders `NoAccessPage` INSIDE the normal layout and
does NOT mount the page component, so the page fires no request at all.

`client/src/components/no-access-page.tsx`, `data-testid="no-access-page"`:
heading "U heeft geen toegang tot dit scherm", one sentence naming the missing
right in words ("Hiervoor is het recht 'onderhoud beheren' nodig. Vraag een
beheerder om het aan te zetten."), and a button to the first screen the user
may open (`firstOpenablePage`); no button when there is none. An unknown
address keeps showing the existing not-found page. Texts in
`client/src/locales/{nl,en}/common.json`; the names of the rights reuse the
labels the users dialog already shows (find them; do not invent a second list).

The header widgets in `MainLayout` (notification centre: five unconditional
queries, see the fact sheet "Global") are gated per query with the permission
their route requires, like the already-gated ones.

## 3. Parts of a screen that need another permission (B-29)

For every unconditional query the fact sheet lists with a guard outside the
screen's own permission family: `enabled: useHasPermission(<exactly the
permissions that route accepts>)`. Where the missing data leaves a visible
hole (a list, a card, a column of names), the part renders
`<NoDataAccess permission="…" />` — one muted line "Geen toegang tot deze
gegevens (recht '…')" — instead of an empty or broken state. Where the data
only enriches (a count, a badge, a name next to an id) it is simply left out.
No screen may show an error toast, an error boundary or a spinner that never
ends for any combination of rights.

## 4. Disabled controls with an explanation (B-27)

New `client/src/components/ui/requires-permission.tsx`:

```tsx
<RequiresPermission anyOf={[…]} allOf={[…]}>   {/* one of the two, or both */}
  <Button …>Voertuig toevoegen</Button>
</RequiresPermission>
```

Allowed → renders the child untouched. Not allowed → the child is rendered
`disabled` (and `aria-disabled`), greyed by the button's normal disabled style,
its `onClick` never fires, and hovering or focusing it shows a tooltip
"Hiervoor heeft u het recht '…' nodig" (a disabled button swallows pointer
events: wrap it in a focusable span that carries the tooltip). Works for
`Button`, the dashboard quick-action tiles, dropdown menu items and icon
buttons. `useHasAllPermissions(...allOf)` is added next to `useHasPermission`.
An action that needs several rights is enabled only with all of them.

Applied to every control in section 3 of the fact sheet (68), each with exactly
the permission(s) of the server route its action finally calls. Controls that
are hidden for non-admins today stay as they are. A control whose dialog only
READS (view, print, export of data the user may already see) is not disabled.

## 5. Server

Unchanged, except: maintenance ACTIONS (creating, editing, completing and
deleting maintenance blocks, APK and warranty updates made from the
maintenance screen) are audited against their routes. Where such a route does
not accept `manage_maintenance`, the mismatch is reported in the task report
with the route, its guard and who is affected, and is NOT changed in this
sub-project unless the route is reachable ONLY from the maintenance screen — in
that case it additionally accepts `manage_maintenance` (OR), with a server
test, and the change is listed for the owner in the final summary. Nothing is
narrowed.

## 6. Tests

- `shared/page-access.test.ts`: every sidebar entry has a table row; pattern
  matching; admin passes; `firstOpenablePage`.
- Client: `NoAccessPage`/`ProtectedRoute` (page component not mounted, no fetch,
  right text, way out), `RequiresPermission` (allowed/denied, `anyOf`/`allOf`,
  click never fires, tooltip text, keyboard focus), one test per gated query
  group as in the earlier permission fixes.
- Server: only for a guard touched under §5.
- E2E: `forbidden.spec.ts` asserts the no-access page, its text, and that no
  `/api/` page request was made (the header's allowed ones excepted);
  `dialogs.spec.ts` asserts, for a profile that may not use an opener, that it
  is visible, disabled and explains itself — instead of skipping it;
  `pages.spec.ts` stays strict (no toast for any profile). A new profile is
  added to the seed for the latent cases: `reports-only` (`view_dashboard`,
  `view_reports`) must open `/` and `/reports` without a single violation.
  The desk story must stay green with unchanged budgets.

## 7. Manual

`docs/gebruikershandleiding/` gets a short section where rights are explained:
what someone sees without a right (the no-access page, greyed buttons with the
reason, "geen toegang tot deze gegevens"), and that Transport is shown to
everyone who may see reservations or vehicles.
