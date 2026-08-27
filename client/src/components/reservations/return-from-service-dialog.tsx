import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Reservation, Vehicle } from "@shared/schema";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle } from "lucide-react";

const returnFromServiceSchema = z.object({
  returnDate: z.string().min(1, "Return date is required"),
  mileage: z.string().optional(),
  notes: z.string().optional(),
});

type ReturnFromServiceFormData = z.infer<typeof returnFromServiceSchema>;

interface ReturnFromServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacementReservation?: Reservation;
  originalReservation?: Reservation;
  onSuccess?: () => void;
}

export function ReturnFromServiceDialog({
  open,
  onOpenChange,
  replacementReservation,
  originalReservation,
  onSuccess,
}: ReturnFromServiceDialogProps) {
  const { t } = useTranslation("reservations");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ReturnFromServiceFormData>({
    resolver: zodResolver(returnFromServiceSchema),
    defaultValues: {
      returnDate: new Date().toISOString().split('T')[0], // Today's date
      mileage: "",
      notes: "",
    },
  });

  const returnFromServiceMutation = useMutation({
    mutationFn: async (data: ReturnFromServiceFormData) => {
      if (!replacementReservation) {
        throw new Error("No replacement reservation found");
      }

      const response = await apiRequest("POST", `/api/reservations/${replacementReservation.id}/return-from-service`, {
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to return vehicle from service");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries to update UI state
      if (originalReservation) {
        invalidateRelatedQueries('reservations', {
          id: originalReservation.id,
          vehicleId: originalReservation.vehicleId
        });
      }
      if (replacementReservation) {
        invalidateRelatedQueries('reservations', {
          id: replacementReservation.id,
          vehicleId: replacementReservation.vehicleId
        });
        invalidateRelatedQueries('vehicles', { id: replacementReservation.vehicleId });
      }
      invalidateRelatedQueries('vehicles', { id: originalReservation?.vehicleId });
      
      toast({
        title: t('returnFromServiceDialog.toasts.successTitle'),
        description: t('returnFromServiceDialog.toasts.successDescription'),
      });
      onSuccess?.();
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('returnFromServiceDialog.toasts.errorTitle'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ReturnFromServiceFormData) => {
    returnFromServiceMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-return-from-service">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            {t('returnFromServiceDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('returnFromServiceDialog.description')}
            {originalReservation && (
              <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                {t('returnFromServiceDialog.originalVehicleLabel', {
                  brand: originalReservation.vehicle?.brand,
                  model: originalReservation.vehicle?.model,
                  plate: originalReservation.vehicle?.licensePlate,
                })}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="returnDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('returnFromServiceDialog.returnDateLabel')}</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      data-testid="input-return-date"
                    />
                  </FormControl>
                  <FormDescription>
                    {t('returnFromServiceDialog.returnDateHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mileage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('returnFromServiceDialog.currentMileageLabel')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder={t('returnFromServiceDialog.currentMileagePlaceholder')}
                      {...field}
                      data-testid="input-return-mileage"
                    />
                  </FormControl>
                  <FormDescription>
                    {t('returnFromServiceDialog.currentMileageHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('returnFromServiceDialog.serviceNotesLabel')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('returnFromServiceDialog.serviceNotesPlaceholder')}
                      {...field}
                      data-testid="textarea-service-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    {t('returnFromServiceDialog.serviceNotesHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={returnFromServiceMutation.isPending}
              >
                {t('returnFromServiceDialog.cancelButton')}
              </Button>
              <Button
                type="submit"
                disabled={returnFromServiceMutation.isPending}
                data-testid="button-submit-return"
              >
                {returnFromServiceMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('returnFromServiceDialog.processingButton')}
                  </>
                ) : (
                  t('returnFromServiceDialog.submitButton')
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}