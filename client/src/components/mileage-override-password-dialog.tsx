import { useState } from "react";
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
import { AlertTriangle, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MileageOverridePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (password: string) => Promise<boolean>;
  currentMileage: number;
  newMileage: number;
}

export function MileageOverridePasswordDialog({
  open,
  onOpenChange,
  onConfirm,
  currentMileage,
  newMileage,
}: MileageOverridePasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError("Please enter your mileage override password");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const isValid = await onConfirm(password);
      
      if (isValid) {
        // Password is correct, dialog will close via onOpenChange
        setPassword("");
        setError(null);
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancel = () => {
    setPassword("");
    setError(null);
    onOpenChange(false);
  };

  const mileageDecrease = currentMileage - newMileage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-mileage-override">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600" />
            Mileage Override Required
          </DialogTitle>
          <DialogDescription>
            You are attempting to decrease the vehicle mileage, which requires authorization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-1">Mileage Decrease Detected</div>
              <div className="text-sm">
                Current mileage: <span className="font-mono font-semibold">{currentMileage.toLocaleString()} km</span>
              </div>
              <div className="text-sm">
                New mileage: <span className="font-mono font-semibold">{newMileage.toLocaleString()} km</span>
              </div>
              <div className="text-sm mt-1">
                Decrease: <span className="font-mono font-semibold text-red-600">-{mileageDecrease.toLocaleString()} km</span>
              </div>
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="override-password">Mileage Override Password</Label>
              <Input
                id="override-password"
                type="password"
                placeholder="Enter your mileage override password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                disabled={isVerifying}
                autoFocus
                data-testid="input-override-password"
              />
              {error && (
                <p className="text-sm text-destructive" data-testid="text-password-error">
                  {error}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                This is not your account password. If you haven't set up a mileage override password, 
                you can do so in your profile settings.
              </p>
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isVerifying}
            data-testid="button-cancel-override"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isVerifying || !password}
            data-testid="button-confirm-override"
          >
            {isVerifying ? "Verifying..." : "Confirm Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
