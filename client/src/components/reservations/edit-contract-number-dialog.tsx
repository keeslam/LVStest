import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface EditContractNumberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number;
  currentContractNumber?: string | null;
  onSaved?: (newContractNumber: string) => void | Promise<void>;
}

type DuplicateInfo = {
  reservationId: number;
} | null;

export function EditContractNumberDialog({
  open,
  onOpenChange,
  reservationId,
  currentContractNumber,
  onSaved,
}: EditContractNumberDialogProps) {
  const { toast } = useToast();
  const [value, setValue] = useState<string>(currentContractNumber ?? "");
  const [duplicate, setDuplicate] = useState<DuplicateInfo>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(currentContractNumber ?? "");
      setDuplicate(null);
    }
  }, [open, currentContractNumber]);

  // Debounced uniqueness check
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === (currentContractNumber ?? "").trim()) {
      setDuplicate(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/reservations/find-by-contract/${encodeURIComponent(trimmed)}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = await res.json();
          const found = data?.reservation;
          if (data?.exists && found?.id && found.id !== reservationId) {
            setDuplicate({ reservationId: found.id });
          } else {
            setDuplicate(null);
          }
        } else {
          setDuplicate(null);
        }
      } catch {
        setDuplicate(null);
      } finally {
        setChecking(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, currentContractNumber, reservationId]);

  const saveMutation = useMutation({
    mutationFn: async (newValue: string) => {
      const res = await apiRequest("PATCH", `/api/reservations/${reservationId}`, {
        contractNumber: newValue,
      });
      return res.json();
    },
    onSuccess: (_data, newValue) => {
      toast({
        title: "Contract number updated",
        description: `Contract number is now "${newValue}".`,
      });
      // Close immediately for snappy UX; fire-and-forget the cache refresh.
      onOpenChange(false);
      invalidateByPrefix("/api/reservations");
      if (onSaved) {
        Promise.resolve(onSaved(newValue)).catch(() => {});
      }
    },
    onError: (error: any) => {
      const msg = String(error?.message || "");
      // apiRequest throws "<status>: <body>"; try to extract a friendly message.
      let friendly = "Please try again.";
      if (msg.includes("DUPLICATE_CONTRACT_NUMBER") || msg.startsWith("409")) {
        friendly = "That contract number is already used by another reservation.";
        setDuplicate({ reservationId: 0 });
      } else if (msg) {
        friendly = msg.replace(/^\d+:\s*/, "");
      }
      toast({
        title: "Could not update contract number",
        description: friendly,
        variant: "destructive",
      });
    },
  });

  const trimmed = value.trim();
  const isEmpty = trimmed === "";
  const isUnchanged = trimmed === (currentContractNumber ?? "").trim();
  const canSave =
    !isEmpty && !isUnchanged && !duplicate && !checking && !saveMutation.isPending;

  const handleSave = () => {
    if (!canSave) return;
    saveMutation.mutate(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Edit Contract Number</DialogTitle>
          <DialogDescription>
            Update the contract number for this reservation. Must be unique across all
            reservations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-contract-number">Contract Number</Label>
            <Input
              id="edit-contract-number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter contract number"
              autoFocus
              data-testid="input-edit-contract-number"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>

          {checking && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking availability...
            </div>
          )}

          {!checking && duplicate && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Already used by reservation #{duplicate.reservationId}. Choose a different
                number.
              </span>
            </div>
          )}

          {!checking && !duplicate && !isEmpty && !isUnchanged && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Available
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="button-save-contract-number"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
