---
name: Cache invalidation strategy
description: How TanStack Query invalidation must be split between mutation-driven (active) and websocket-driven (soft) in this app
---

# Cache invalidation strategy

**Rule:** Post-mutation invalidation (`invalidateByPrefix` in queryClient.ts, helpers in cache-utils.ts) must use `refetchType: 'active'`. Websocket-driven invalidation (use-socket.tsx) must stay `refetchType: 'none'` (soft).

**Why:** Global query defaults disable refetchOnWindowFocus/reconnect/interval. With soft invalidation on the mutation path, mounted list pages never refreshed after a save (e.g. edited APK date stayed stale until manual browser refresh). But remote websocket pushes must stay soft so they never disturb a form someone is mid-editing.

**How to apply:** When adding new mutation success handlers, use `invalidateByPrefix`/`invalidateRelatedQueries` — never pass `refetchType: 'none'` on mutation paths. When adding websocket event handlers, keep invalidation soft.

## Companion rule: guard form.reset in dialogs

Dialogs that call `form.reset(...)` inside a `useEffect` keyed on query-derived data (or props derived from parent queries) must guard the reset, or an active background refetch wipes unsaved edits. Pattern used (see maintenance-edit-dialog, schedule-maintenance-dialog, driver-dialog, spare-vehicle-assignment-dialog):

- Track `lastResetKeyRef` = entity id (or a stable ID signature for arrays).
- Skip the reset when the key is unchanged AND `form.formState.isDirty` (or a file is selected).
- Clear the ref when the dialog closes so reopening always resets fresh.

**Residual known risk:** VehicleEditDialog/VehicleDeleteDialog are still rendered inside DataTable cells (rows keyed by index); a list refetch that reorders rows while one is open could rebind/close it. Low exposure (only own-mutation refetches fire while modal open). Proper hardening = lift dialog state to page level like the vehicles-page view-dialog pattern.
