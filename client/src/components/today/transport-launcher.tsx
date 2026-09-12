/**
 * OPT-001 — opening one of today's transports from the "Vandaag" board.
 *
 * Same idea as `handover-launcher.tsx`: the board row carries five fields, the
 * transport dialog wants the row, so it is fetched when the button is pressed
 * and not before. Reuses `/delivery`'s own dialog rather than growing a second
 * one, so marking a transport "onderweg" or "afgerond" works exactly the way
 * it does on the transports page.
 */
import { useQuery } from "@tanstack/react-query";
import type { VehicleTransport } from "@shared/schema";
import { TransportDialog } from "@/components/delivery/transport-dialog";

interface TransportLauncherProps {
  transportId: number | null;
  onClose: () => void;
}

export function TransportLauncher({ transportId, onClose }: TransportLauncherProps) {
  const { data: transport } = useQuery<VehicleTransport>({
    queryKey: [`/api/transports/${transportId}`],
    enabled: !!transportId,
  });

  if (!transportId || !transport) return null;

  return (
    <TransportDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      editingTransport={transport}
    />
  );
}
