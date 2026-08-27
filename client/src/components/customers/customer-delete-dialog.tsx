import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";

interface CustomerDeleteDialogProps {
  customerId: number;
  customerName: string;
  children?: React.ReactNode;
  onSuccess?: () => void;
  /**
   * Optional controlled mode. When `open`/`onOpenChange` are provided the
   * dialog renders without its own trigger and its open state is owned by the
   * parent (e.g. page-level state that survives table re-renders).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CustomerDeleteDialog({ 
  customerId, 
  customerName, 
  children, 
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: CustomerDeleteDialogProps) {
  const { t } = useTranslation(["customers", "common"]);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  };
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/customers/${customerId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete customer');
      }
      
      // Handle 204 No Content or empty responses
      if (response.status === 204) {
        return null;
      }
      
      // Try to parse JSON, but handle empty responses gracefully
      try {
        return await response.json();
      } catch {
        return null;
      }
    },
    onSuccess: () => {
      // Refresh the customers list
      invalidateByPrefix("/api/customers");

      toast({
        title: t('deleteDialog.deletedTitle'),
        description: t('deleteDialog.deletedDescription', { name: customerName }),
        variant: "default"
      });

      setOpen(false);

      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: error.message || t('deleteDialog.deleteFailed'),
        variant: "destructive"
      });
    }
  });

  const handleDelete = () => {
    deleteCustomerMutation.mutate();
  };

  // Custom trigger or default delete button
  const trigger = children || (
    <Button
      variant="destructive"
      size="sm"
      data-testid={`button-delete-customer-${customerId}`}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {t('common:actions.delete')}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
          <DialogDescription>
            <Trans
              t={t}
              i18nKey="deleteDialog.description"
              values={{ name: customerName }}
              components={{ 1: <strong /> }}
            />
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={deleteCustomerMutation.isPending}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteCustomerMutation.isPending}
            data-testid={`button-confirm-delete-${customerId}`}
          >
            {deleteCustomerMutation.isPending ? t('deleteDialog.deleting') : t('deleteDialog.deleteCustomer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}