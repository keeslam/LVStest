/**
 * Rapporten herontwerp deel 1b, Task 3: a plate, customer, reservation, fine, driver or invoice in
 * a report list. With the right for that kind of record (the same right that opens its screen)
 * and an id it is a link that opens the quick view (EntityQuickView); otherwise plain text.
 *
 * Only for the screen (`cell`); search, CSV and print keep the plain text (`text`/`csv`).
 */
import { useState, type ReactNode } from "react";
import { useHasPermission } from "@/hooks/use-has-permission";
import { ENTITY_RIGHTS, EntityQuickView, type EntityKind } from "./entity-quick-view";

export { entityUrl, ENTITY_RIGHTS, EntityQuickView, type EntityKind } from "./entity-quick-view";

/** True when the signed-in user may open records of this kind. */
export function useCanOpenEntity(kind: EntityKind): boolean {
  return useHasPermission(...ENTITY_RIGHTS[kind]);
}

export function EntityLink({ kind, id, label, children }: {
  kind: EntityKind;
  id: number | null | undefined;
  /** The text in the list; also the dialog title. */
  label: string;
  /** What to show instead of the bare label (e.g. a styled name); defaults to the label. */
  children?: ReactNode;
}) {
  const allowed = useCanOpenEntity(kind);
  const [open, setOpen] = useState(false);
  const shown = children ?? label;
  if (!allowed || id == null || !label) return <>{shown}</>;
  // The quick view is a portal, but React events still bubble to the table row (onRowClick): stop them here.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span
      className="contents"
      onClick={stop}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
    >
      <button
        type="button"
        className="text-left text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        data-testid={`link-entity-${kind}-${id}`}
      >
        {shown}
      </button>
      {open && <EntityQuickView kind={kind} id={id} label={label} open={open} onOpenChange={setOpen} />}
    </span>
  );
}
