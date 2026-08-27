// client/src/pages/settings/damage-check-template-studio.tsx
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DamageCheckTemplates from "@/pages/settings/damage-check-templates";
import DamageCheckFieldsPage from "@/pages/settings/damage-check-fields";

export default function DamageCheckTemplateStudio({ embedded = false, isAdmin = false }: { embedded?: boolean; isAdmin?: boolean } = {}) {
  const { t } = useTranslation("settings");
  return (
    <div className={embedded ? "flex flex-col h-full" : "container mx-auto p-6"}>
      <Tabs defaultValue="templates" className="flex flex-col h-full">
        <TabsList className={isAdmin ? "grid w-full grid-cols-2 flex-shrink-0" : "grid w-full grid-cols-1 flex-shrink-0"}>
          <TabsTrigger value="templates" data-testid="tab-studio-templates">{t('damageCheckStudio.templatesTab')}</TabsTrigger>
          {isAdmin && <TabsTrigger value="fields" data-testid="tab-studio-fields">{t('damageCheckStudio.fieldsTab')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="templates" forceMount className="flex-1 overflow-auto data-[state=inactive]:hidden">
          <DamageCheckTemplates embedded />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="fields" className="flex-1 overflow-auto">
            <DamageCheckFieldsPage embedded />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
