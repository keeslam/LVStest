// client/src/pages/settings/damage-check-template-studio.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DamageCheckTemplates from "@/pages/settings/damage-check-templates";
import DamageCheckFieldsPage from "@/pages/settings/damage-check-fields";

export default function DamageCheckTemplateStudio({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <div className={embedded ? "flex flex-col h-full" : "container mx-auto p-6"}>
      <Tabs defaultValue="templates" className="flex flex-col h-full">
        <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
          <TabsTrigger value="templates" data-testid="tab-studio-templates">Templates</TabsTrigger>
          <TabsTrigger value="fields" data-testid="tab-studio-fields">Fields</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="flex-1 overflow-auto">
          <DamageCheckTemplates embedded />
        </TabsContent>
        <TabsContent value="fields" className="flex-1 overflow-auto">
          <DamageCheckFieldsPage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
