import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  new: "secondary", linked: "default", charged: "outline", paid: "default", disputed: "destructive", cancelled: "secondary",
};

export function FineStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("portal");
  return (
    <Badge variant={VARIANT[status] ?? "outline"} className={status === "paid" ? "bg-green-600 hover:bg-green-600" : undefined}>
      {t(`admin.fines.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
