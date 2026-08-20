---
name: Dialogs must not live inside DataTable cells
description: Why dialogs opened from table rows close on their own, and the page-level state pattern that fixes it
---

**Rule:** Never render a stateful dialog (one that owns its `open` state) inside a DataTable/TanStack Table `cell:` renderer. Cells must render plain buttons that set page-level state (`selectedId`, target object); a single dialog instance is rendered at page level, conditionally with `key={id}`, using controlled `open`/`onOpenChange` props.

**Why:** Column arrays are declared inline in page components, so every page re-render creates new `cell:` function identities. TanStack's `flexRender` uses the cell function as a React element type, so React unmounts and remounts the whole cell subtree on every page re-render. Any refetch (list invalidation after a save, websocket echo, sibling queries like warranty/apk-expiring) re-renders the page and silently destroys an open in-cell dialog — the user sees it "close by itself a few seconds after saving." This class of bug was masked until mutations' invalidations actually refetched (see cache-invalidation-strategy.md); fixing the cache made it surface.

**How to apply:** Follow the existing precedent in `vehicles/index.tsx` (ReservationAddDialog, VehicleEditDialog, VehicleDeleteDialog) and `customers/index.tsx`. Dialog components support dual mode: uncontrolled with their own trigger (default, backwards compatible) or controlled via optional `open`/`onOpenChange` props, skipping `DialogTrigger` when controlled. Expenses/documents/users pages already used page-level dialog state.

**Known residual case (low priority):** the empty-state ReservationAddDialog in `reservations/index.tsx` is still uncontrolled inside a conditional block; it closes if a websocket event makes the list non-empty while open.
