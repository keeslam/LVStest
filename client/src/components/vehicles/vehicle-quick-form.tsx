import { useState } from "react";
import { useTranslation } from "react-i18next";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { Vehicle } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import z from "zod";
import { formSchema } from "./vehicle-form"; // Reuse the form schema from the main form

interface VehicleQuickFormProps {
  onSuccess: (vehicle: Vehicle) => void;
  onCancel: () => void;
}

/**
 * A standalone wrapper component for vehicle creation in a dialog
 * This bypasses the navigation issues with the main VehicleForm
 */
export function VehicleQuickForm({ onSuccess, onCancel }: VehicleQuickFormProps) {
  console.log("VehicleQuickForm mounted - standalone implementation");
  const { t } = useTranslation("vehicles");
  const { toast } = useToast();
  
  // Use a separate mutation to avoid any potential navigation issues
  const createVehicleMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("Quick form sending data:", data);
      const response = await apiRequest("POST", "/api/vehicles", data);
      if (!response.ok) {
        const errorData = await response.json();
        const error: any = new Error(errorData.message || t('vehicleForm.toasts.genericCreateFailed'));
        error.status = response.status;
        error.data = errorData;
        throw error;
      }
      return await response.json();
    },
    onSuccess: async (vehicleData) => {
      console.log("Vehicle created successfully in quick form:", vehicleData);

      // Show success message
      toast({
        title: t('vehicleForm.toasts.vehicleCreatedTitle'),
        description: t('vehicleForm.toasts.vehicleCreatedDescription'),
      });

      // Invalidate related vehicle queries using the unified system
      await invalidateRelatedQueries('vehicles');

      // Call the parent's onSuccess with the vehicle data
      onSuccess(vehicleData);
    },
    onError: (error: any) => {
      console.error("Failed to create vehicle in quick form:", error);

      // Check for duplicate license plate error
      const isDuplicate =
        error.status === 409 ||
        error.message?.includes("license plate already exists") ||
        error.message?.includes("duplicate key");

      const title = isDuplicate ? t('vehicleForm.toasts.duplicateLicensePlateTitle') : t('vehicleForm.toasts.errorTitle');
      const description = error.message || t('vehicleForm.toasts.genericCreateFailed');

      toast({
        title,
        description,
        variant: "destructive",
      });
    }
  });
  
  // Pass our direct submitHandler to the form
  const handleSubmit = (formattedData: any) => {
    console.log("VehicleQuickForm handling submission with formatted data");
    // Data is already processed by the VehicleForm component
    // Just submit directly to our mutation
    createVehicleMutation.mutate(formattedData);
  };
  
  return (
    <VehicleForm 
      redirectToList={false}
      // Override the form submission to use our local mutation
      onSubmitOverride={handleSubmit}
      customCancelButton={
        <button 
          type="button" 
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          onClick={onCancel}
        >
          {t('common:actions.cancel')}
        </button>
      }
    />
  );
}