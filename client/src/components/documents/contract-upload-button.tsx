import { invalidateByPrefix } from "@/lib/queryClient";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineDocumentUpload } from "@/components/documents/inline-document-upload";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";

interface UploadContractButtonProps {
  vehicleId: number;
  reservationId: number;
  onSuccess?: () => void;
}

export function UploadContractButton({ vehicleId, reservationId, onSuccess }: UploadContractButtonProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = () => {
    // Invalidate relevant queries
    invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
    invalidateByPrefix(`/api/reservations/${reservationId}`);
    
    // Trigger additional callback if provided
    if (onSuccess) {
      onSuccess();
    }
  };

  return (
    <InlineDocumentUpload 
      vehicleId={vehicleId}
      preselectedType="Contract"
      onSuccess={handleSuccess}
    >
      <Button variant="outline">
        <Upload className="h-4 w-4 mr-2" />
        Upload Contract
      </Button>
    </InlineDocumentUpload>
  );
}