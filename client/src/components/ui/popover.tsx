import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { useMergedRef } from "@/components/ui/dialog"
import { touchSafeOpenAutoFocus } from "@/lib/touch-focus"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, onOpenAutoFocus, ...props }, ref) => {
  const [contentRef, setContentRef] = useMergedRef<HTMLDivElement>(ref);
  // iPad: no on-screen keyboard just because a popup with a search field opened.
  const handleOpenAutoFocus = touchSafeOpenAutoFocus(onOpenAutoFocus, () => contentRef.current);
  return (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={setContentRef}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // z-[100]: see the matching note in select.tsx — must outrank any
        // dialog's own stacked z-index, not just tie with its base overlay.
        "z-[100] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      onOpenAutoFocus={handleOpenAutoFocus}
      {...props}
    />
  </PopoverPrimitive.Portal>
  );
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
