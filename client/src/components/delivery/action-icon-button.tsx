import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ActionIconButtonProps extends Omit<ButtonProps, "title" | "size" | "variant" | "children"> {
  /** What the button does: its accessible name and its tooltip. */
  label: string;
  children: React.ReactNode;
}

/**
 * An icon-only table action that names itself (A-8-7): `aria-label` for screen
 * readers and a tooltip that shows on hover and on keyboard focus - the native
 * `title` it replaces appears late and never on touch.
 *
 * The button sits in a span so the tooltip also works while the button is
 * disabled (a disabled button swallows pointer events). When `RequiresPermission`
 * has switched the control off it already shows its own tooltip with the missing
 * right, so no second one is stacked on top.
 */
export const ActionIconButton = React.forwardRef<HTMLButtonElement, ActionIconButtonProps>(
  ({ label, children, ...props }, ref) => {
    const button = (
      <Button ref={ref} size="icon" variant="ghost" aria-label={label} {...props}>
        {children}
      </Button>
    );
    if (props["aria-disabled"]) return button;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{button}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
ActionIconButton.displayName = "ActionIconButton";
