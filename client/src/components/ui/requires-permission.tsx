import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { permissionLabel } from "@shared/permission-labels";
import { useHasPermission, useHasAllPermissions } from "@/hooks/use-has-permission";
import { cn } from "@/lib/utils";

export interface RequiresPermissionProps extends React.HTMLAttributes<HTMLElement> {
  /** At least one of these is enough (OR) — mirrors `useHasPermission`. */
  anyOf?: string[];
  /** All of these are required together (AND) — mirrors `useHasAllPermissions`. */
  allOf?: string[];
  /** The single control to gate: a `Button`, a dashboard quick-action tile, a `DropdownMenuItem`, an icon button, … */
  children: React.ReactElement;
}

/**
 * B-27 (docs/superpowers/specs/2026-09-21-toegang-design.md, §4) — a control
 * a user may not use STAYS VISIBLE, greyed out and switched off, with the
 * reason, instead of being hidden the way every existing permission gate in
 * this codebase does today (fact sheet, "Controls already correctly gated" —
 * all of them are `{condition && <Element/>}`).
 *
 * Allowed: renders `children` untouched via Radix's `Slot`, not a plain
 * `{children}` return — an ancestor `asChild` composition (e.g. this wrapper
 * sitting inside a shadcn `<DialogTrigger asChild>`) clones its own props
 * (onClick, ref, aria-haspopup, …) onto whatever single element it finds as
 * its JSX child, which is this component, not the button inside it. `Slot`
 * is exactly the primitive Radix's own `asChild` implementations use to stay
 * transparent in that situation: it forwards everything it received
 * (`...rest`, `ref`) onto the real child with no extra DOM node, so a
 * `data-testid`, ref or table-row layout survives untouched either way.
 *
 * Denied: the child is cloned `disabled`/`aria-disabled`, wrapped in a
 * focusable `<span>` that carries a `Tooltip` naming the missing right(s).
 * Two things make this wrapper necessary rather than putting the tooltip on
 * the button directly:
 *   - A disabled `<button>` swallows pointer events (only a mouse hovering
 *     over it still reaches the surrounding `<span>`, because
 *     `disabled:pointer-events-none` lets the hit-test pass through to the
 *     ancestor — this is the same trick `client/src/pages/vehicles/index.tsx`
 *     already uses for its "not for rental" Reserve button, just for a
 *     business-state reason instead of a permission one).
 *   - A disabled `<button>` cannot receive focus at all (browsers remove it
 *     from the tab order entirely), so a keyboard user could never reach the
 *     reason without a separate focusable element — the wrapping `<span
 *     tabIndex={0}>` is that element (the existing vehicles/index.tsx pattern
 *     does not have this and is therefore not fully keyboard-reachable;
 *     this component deliberately improves on it, per the task brief).
 * The ancestor's `rest` props (notably an `asChild` ancestor's `onClick`,
 * e.g. a `DialogTrigger`'s open handler) are deliberately NOT forwarded in
 * this branch — that is what makes a click on a denied control never open
 * anything, "even when clicked through the wrapper".
 *
 * Fix round 1, item 4 (reviewer): the wrapping `<span>` — not the button — is
 * what a CSS grid/flex parent (e.g. ScanPanel's action grid, a flex action
 * row with `flex-1` buttons) actually lays out as its item, once this
 * wrapper is in between. The span only ever carried its own `inline-flex`,
 * so it never picked up the child's own sizing classes (`w-full`, `flex-1`,
 * `h-auto`, …) and rendered narrower than an allowed sibling doing the exact
 * same job. The span's className now also carries the child's own
 * className (tailwind-merge resolves any overlap, child wins), so it takes
 * the same box a Slot-forwarded allowed child would have taken.
 *
 * Fix round 2 (reviewer), CLASS defect: stripping the child's own `onClick`
 * only breaks the `asChild`/`rest`-forwarding channel (an ancestor like
 * `DialogTrigger` cloning ITS OWN onClick onto this component). It does
 * nothing about plain DOM event bubbling: `InlineDocumentUpload` (and every
 * other site that wraps a gated trigger in its own `<div onClick={...}>`)
 * has a real click handler on an ANCESTOR of this span. A disabled
 * `<button>`'s `pointer-events: none` makes the browser's hit-test resolve
 * the click to this wrapping `<span>` — which, having no handler of its own,
 * let the event keep bubbling past it and past the button, straight into
 * that ancestor's handler, defeating "even when clicked through the
 * wrapper" for every such composition. The span now swallows activation
 * itself (click, double-click, pointerdown, mousedown, and Enter/Space on
 * keydown) with `preventDefault`/`stopPropagation`, so no ancestor's own
 * click handler is ever reached from here, regardless of how it is wired.
 * Radix's `TooltipTrigger` (composed via `asChild` onto this same span)
 * listens for pointer enter/leave and focus/blur, not click/keydown, so
 * swallowing those does not affect the tooltip's own show/hide logic.
 */
export const RequiresPermission = React.forwardRef<HTMLElement, RequiresPermissionProps>(
  ({ anyOf = [], allOf = [], children, ...rest }, ref) => {
    const { t } = useTranslation("common");
    const hasAny = useHasPermission(...anyOf);
    const hasAll = useHasAllPermissions(...allOf);
    const allowed = (anyOf.length === 0 || hasAny) && (allOf.length === 0 || hasAll);

    if (allowed) {
      return (
        <Slot ref={ref} {...rest}>
          {children}
        </Slot>
      );
    }

    const orWord = t("requiresPermission.or");
    const andWord = t("requiresPermission.and");
    const anyPhrase = anyOf.length > 0 ? anyOf.map((permission) => `'${permissionLabel(permission)}'`).join(` ${orWord} `) : null;
    const allPhrase = allOf.length > 0 ? allOf.map((permission) => `'${permissionLabel(permission)}'`).join(` ${andWord} `) : null;
    const permissionsPhrase = [anyPhrase, allPhrase].filter((phrase): phrase is string => phrase !== null).join(` ${andWord} `);

    const disabledChild = React.cloneElement(children, {
      disabled: true,
      "aria-disabled": true,
      tabIndex: -1,
      onClick: undefined,
    });

    // Fix round 2: swallow activation on the span itself, so a click or a
    // keyboard Enter/Space that lands here (because the disabled child
    // swallows pointer events, or because this span is what actually has
    // focus) never bubbles into a clickable ANCESTOR — e.g.
    // InlineDocumentUpload's own `<div onClick={() => setIsOpen(true)}>`
    // that wraps the gated trigger from the outside.
    const swallowActivation = (event: React.SyntheticEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const swallowActivationKeys = (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        swallowActivation(event);
      }
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={cn("inline-flex", children.props.className)}
              onClick={swallowActivation}
              onDoubleClick={swallowActivation}
              onPointerDown={swallowActivation}
              onMouseDown={swallowActivation}
              onKeyDown={swallowActivationKeys}
            >
              {disabledChild}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("requiresPermission.reason", { permissions: permissionsPhrase })}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
RequiresPermission.displayName = "RequiresPermission";
