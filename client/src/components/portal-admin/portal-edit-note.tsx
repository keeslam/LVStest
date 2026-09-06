import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ActivityRow { id: number; action: string; details: Record<string, unknown> | null; createdAt: string; userName: string | null }

/** On the customer card: who last changed the contact addresses through the portal, and when. */
export function PortalEditNote({ customerId }: { customerId: number }) {
  const { t } = useTranslation("portal");
  const { data = [] } = useQuery<ActivityRow[]>({
    queryKey: ["/api/portal-admin/activity", { customerId, limit: 100 }],
    queryFn: async () => (await apiRequest("GET", `/api/portal-admin/activity?customerId=${customerId}&limit=100`)).json(),
  });
  const last = data.find((r) => r.action === "company_emails_updated");
  if (!last) return null;
  const fields = Object.keys(last.details ?? {}).map((k) => t(`account.company.${k}`, { defaultValue: k })).join(", ");
  return (
    <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-900" data-testid="portal-edit-note">
      <Globe className="h-3.5 w-3.5" />{t("admin.customerTabNote", { name: last.userName ?? "?", date: new Date(last.createdAt).toLocaleString(), fields })}
    </p>
  );
}
