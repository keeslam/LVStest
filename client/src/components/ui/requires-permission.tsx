import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { permissionLabel } from "@shared/permission-labels";
import { useHasPermission, useHasAllPermissions } from "@/hooks/use-has-permission";

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

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
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
