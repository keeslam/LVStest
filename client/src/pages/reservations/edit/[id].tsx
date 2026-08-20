import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { Reservation } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReservationEdit() {
  const { id } = useParams();
  const [initialData, setInitialData] = useState<Reservation | null>(null);
  
  // Fetch reservation data
  const { data: reservation, isLoading, error } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${id}`],
  });
  
  useEffect(() => {
    if (reservation) {
      setInitialData(reservation);
    }
  }, [reservation]);
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-3/12" />
        <div className="space-y-3">
          <Skeleton className="h-[500px] w-full" />
        </div>
      </div>
    );
  }
  
  if (error || !reservation) {
    return (
      <div className="bg-red-50 border border-red-200 p-4 rounded-md">
        <h2 className="text-lg font-semibold text-red-800">Error</h2>
        <p className="text-red-600">Failed to load reservation details. {(error as Error)?.message}</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Reservation</h1>
      {initialData && <ReservationForm editMode={true} initialData={initialData} />}
    </div>
  );
}