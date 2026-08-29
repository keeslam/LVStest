import { useTranslation } from "react-i18next";
import { ScanLine } from "lucide-react";
import { ScanPanel } from "@/components/barcodes/scan-panel";

export default function ScanPage() {
  const { t } = useTranslation(["barcodes", "common"]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanLine className="h-6 w-6" />
          {t("scanPage.title")}
        </h1>
        <p className="text-muted-foreground">{t("scanPage.description")}</p>
      </div>

      <ScanPanel />
    </div>
  );
}
