import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuoteList } from "./quote-list";
import { QuoteSettings } from "./quote-settings";
import { QuoteEditor } from "./quote-editor";

/**
 * Lease offertes: two tabs, the quote list and the settings (defaults for new quotes).
 * The PDF template lives under Documenten.
 */
export default function LeaseQuotesPage() {
  const { t } = useTranslation("leaseQuotes");
  // The quote open in the editor (row click, "Nieuwe offerte", after a copy).
  const [openQuoteId, setOpenQuoteId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Tabs defaultValue="quotes">
        <TabsList>
          <TabsTrigger value="quotes" data-testid="tab-lease-quotes">{t("tabs.quotes")}</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-lease-settings">{t("tabs.settings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="quotes" className="mt-4">
          <QuoteList onOpenQuote={setOpenQuoteId} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <QuoteSettings />
        </TabsContent>
      </Tabs>

      <QuoteEditor quoteId={openQuoteId} onClose={() => setOpenQuoteId(null)} onOpenQuote={setOpenQuoteId} />
    </div>
  );
}
