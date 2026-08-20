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

## Real root cause of the stale-after-save bug: duplicated module instances in Vite dev

The refetchType fix alone did NOT resolve the user-visible bug. In-browser telemetry proved invalidation ran against an EMPTY QueryClient (`invalidate "/api/vehicles": 0 matched` while the same console showed the cache being populated minutes earlier). Vite dev HMR can evaluate a module twice (timestamped `?t=` URL + bare URL served to different importers), so module-level singletons silently fork: queries lived in copy A, mutations invalidated empty copy B.

**Rule:** Any client module holding module-level mutable state that is shared across the app (the QueryClient, handler registries like session-expiry and admin-password-prompt) must store that state on `globalThis` (e.g. `globalThis.__appQueryClient ?? new QueryClient(...)`, Prisma-singleton idiom).

**Why:** Without it, a dev-session HMR sequence forks the state and features fail invisibly (saves look ignored, auto-logout stops firing) until a manual full reload — and it recurs every session where files were edited. Production bundles evaluate modules once, so the bug is dev-only and extremely confusing to reproduce.

**How to apply:** When adding a new module-level registry/singleton in client/src/lib, use the globalThis-backed pattern. Diagnostic tell: an invalidation/predicate reporting 0 matched queries while the page clearly has data mounted.
