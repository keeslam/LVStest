import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useCanViewFines } from "./fines-table";

/** Small "Bekeuringen: n" link in the vehicle dialog header, opening the fines tab filtered on this plate. */
export function VehicleFinesLink({ licensePlate }: { licensePlate: string | null | undefined }) {
  const { t } = useTranslation("portal");
  const canView = useCanViewFines();
  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/fines/count", licensePlate],
    queryFn: async () => (await apiRequest("GET", `/api/fines/count?licensePlate=${encodeURIComponent(licensePlate ?? "")}`)).json(),
    enabled: canView && Boolean(licensePlate),
  });
  if (!canView || !licensePlate || !data || data.count === 0) return null;
  return (
    <Link href={`/portal-admin?tab=fines&plate=${encodeURIComponent(licensePlate)}`} className="text-sm underline text-muted-foreground" data-testid="link-vehicle-fines">
      {t("admin.fines.title")}: {data.count}
    </Link>
  );
}
