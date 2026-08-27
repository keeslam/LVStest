import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["vehicles", "common"]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError(t('mileageOverrideDialog.enterPasswordError'));
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
        setError(t('mileageOverrideDialog.incorrectPassword'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mileageOverrideDialog.genericError'));
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
      {/* z-[70]: this opens on top of the pickup/return dialog, which forces
          its own content to z-[60] - must render above that (see similar note
          in pickup-return-dialogs.tsx). */}
      <DialogContent className="sm:max-w-[500px] z-[70]" data-testid="dialog-mileage-override">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600" />
            {t('mileageOverrideDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('mileageOverrideDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-1">{t('mileageOverrideDialog.decreaseDetected')}</div>
              <div className="text-sm">
                {t('mileageOverrideDialog.currentMileage')} <span className="font-mono font-semibold">{currentMileage.toLocaleString()} km</span>
              </div>
              <div className="text-sm">
                {t('mileageOverrideDialog.newMileage')} <span className="font-mono font-semibold">{newMileage.toLocaleString()} km</span>
              </div>
              <div className="text-sm mt-1">
                {t('mileageOverrideDialog.decrease')} <span className="font-mono font-semibold text-red-600">-{mileageDecrease.toLocaleString()} km</span>
              </div>
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="override-password">{t('mileageOverrideDialog.passwordLabel')}</Label>
              <Input
                id="override-password"
                type="password"
                placeholder={t('mileageOverrideDialog.passwordPlaceholder')}
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
                {t('mileageOverrideDialog.notAccountPasswordHint')}
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
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isVerifying || !password}
            data-testid="button-confirm-override"
          >
            {isVerifying ? t('mileageOverrideDialog.verifying') : t('mileageOverrideDialog.confirmOverride')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
