import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { BookOpen } from "lucide-react";
import { ManualReader } from "@/components/manual/manual-reader";

/**
 * /handleiding en /handleiding/:hoofdstuk — dezelfde lezer als de dialoog in
 * het gebruikersmenu, maar als pagina met een deelbare link per hoofdstuk.
 */
export default function ManualPage() {
  const { t } = useTranslation("nav");
  const params = useParams<{ chapter?: string }>();
  const [, setLocation] = useLocation();

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col p-4 md:p-6" data-testid="manual-page">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-semibold">{t("manual.title")}</h1>
      </div>
      <ManualReader
        className="min-h-0 flex-1"
        chapter={params.chapter}
        onChapterChange={(slug) => setLocation(`/handleiding/${slug}`)}
      />
    </div>
  );
}
