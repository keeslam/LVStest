import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuoteList } from "./quote-list";
import { QuoteSettings } from "./quote-settings";

/**
 * Lease offertes: two tabs, the quote list and the settings (defaults for new quotes).
 * The PDF template lives under Documenten.
 */
export default function LeaseQuotesPage() {
  const { t } = useTranslation("leaseQuotes");
  // HOOK POINT for Task 8: `openQuoteId` is the quote being opened (row click, "Nieuwe offerte",
  // after a copy). Replace the placeholder dialog below with
  // <QuoteEditor quoteId={openQuoteId} onClose={() => setOpenQuoteId(null)} />.
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

      {/* Placeholder until the quote editor (Task 8) exists. */}
      <Dialog open={openQuoteId !== null} onOpenChange={(open) => { if (!open) setOpenQuoteId(null); }}>
        <DialogContent data-testid="dialog-lease-quote-editor-placeholder">
          <DialogHeader>
            <DialogTitle>{t("editorPlaceholder.title", { id: openQuoteId })}</DialogTitle>
            <DialogDescription>{t("editorPlaceholder.description")}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
