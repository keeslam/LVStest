import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert } from "lucide-react";
import {
  registerAdminPasswordPromptHandler,
  unregisterAdminPasswordPromptHandler,
  type AdminPasswordPromptOptions,
} from "@/lib/admin-password-prompt";

type PendingResolver = (password: string | null) => void;

export function AdminPasswordPromptDialog() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolverRef = useRef<PendingResolver | null>(null);

  useEffect(() => {
    registerAdminPasswordPromptHandler(
      (opts: AdminPasswordPromptOptions) =>
        new Promise<string | null>((resolve) => {
          // If a previous prompt is somehow still pending, resolve it as cancelled
          if (resolverRef.current) {
            try {
              resolverRef.current(null);
            } catch {
              /* ignore */
            }
          }
          resolverRef.current = resolve;
          setPassword("");
          setReason(opts.reason);
          setErrorMessage(opts.errorMessage);
          setSubmitting(false);
          setOpen(true);
          // Focus the input shortly after open
          setTimeout(() => inputRef.current?.focus(), 80);
        }),
    );
    return () => {
      unregisterAdminPasswordPromptHandler();
    };
  }, []);

  function finish(value: string | null) {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    setSubmitting(false);
    if (resolver) {
      try {
        resolver(value);
      } catch {
        /* ignore */
      }
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && open) {
      finish(null);
    } else {
      setOpen(next);
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    finish(password);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-admin-password-prompt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Admin approval required
          </DialogTitle>
          <DialogDescription>
            {reason ||
              "This rental was picked up more than 3 weeks ago. Enter an admin password to save your changes."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="admin-password-input">Admin password</Label>
            <Input
              id="admin-password-input"
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-testid="input-admin-password"
            />
          </div>
          {errorMessage && (
            <p
              className="text-sm text-destructive"
              data-testid="text-admin-password-error"
            >
              {errorMessage}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => finish(null)}
              data-testid="button-admin-password-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!password.trim() || submitting}
              data-testid="button-admin-password-submit"
            >
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
