import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { dialogNameFrom, trackUi } from "@/lib/audit-events"
import { touchSafeOpenAutoFocus } from "@/lib/touch-focus"

const Dialog = DialogPrimitive.Root

/**
 * Every dialog in the app goes through DialogContent, so this is the one place
 * that tells the activity log which dialog was opened (named by its title).
 * The title is read after mount, when Radix has wired aria-labelledby.
 */
export function useTrackDialogOpen(ref: React.RefObject<HTMLElement | null>): void {
  React.useEffect(() => {
    const handle = setTimeout(() => trackUi("dialog", dialogNameFrom(ref.current)), 0);
    return () => clearTimeout(handle);
  }, [ref]);
}

/** Merges the caller's forwarded ref with the local one the tracker reads. */
export function useMergedRef<T>(forwarded: React.ForwardedRef<T>): [React.RefObject<T | null>, (node: T | null) => void] {
  const local = React.useRef<T | null>(null);
  const setRef = React.useCallback((node: T | null) => {
    local.current = node;
    if (typeof forwarded === "function") forwarded(node);
    else if (forwarded) (forwarded as React.MutableRefObject<T | null>).current = node;
  }, [forwarded]);
  return [local, setRef];
}

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onOpenAutoFocus, ...props }, ref) => {
  const { t } = useTranslation("common");
  const [contentRef, setContentRef] = useMergedRef<HTMLDivElement>(ref);
  useTrackDialogOpen(contentRef);
  // iPad: no on-screen keyboard just because a dialog with a field opened.
  const handleOpenAutoFocus = touchSafeOpenAutoFocus(onOpenAutoFocus, () => contentRef.current);
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={setContentRef}
      className={cn(
        // Mobile (<sm): full-screen sheet — centering transforms misplace
        // dialogs on phone viewports, so pin to the viewport edges instead
        // and let content scroll. Desktop (sm+): the original centered card,
        // visually unchanged.
        // NOTE: the max-w / max-h / overflow utilities stay UNPREFIXED so
        // tailwind-merge lets caller classNames (max-w-5xl, max-h-[90vh], ...)
        // replace them; sm:-prefixed variants would silently win over callers.
        "fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] w-full max-w-lg max-h-[100dvh] content-start gap-4 overflow-y-auto border bg-background p-4 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:p-6 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      onOpenAutoFocus={handleOpenAutoFocus}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">{t("actions.close")}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}