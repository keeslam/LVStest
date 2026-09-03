import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RequestForm } from "@/components/portal/request-form";
import type { PortalRequestTypeValue } from "@shared/portal-requests";

export default function PortalNewRequestPage() {
  const { t } = useTranslation("portal");
  const params = new URLSearchParams(useSearch());
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("requests.new")}</h1>
      <RequestForm
        initialType={(params.get("type") as PortalRequestTypeValue | null) ?? undefined}
        reservationId={params.get("reservationId") ? Number(params.get("reservationId")) : undefined}
        fineId={params.get("fineId") ? Number(params.get("fineId")) : undefined}
      />
    </div>
  );
}
