import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  Car,
  Download,
  Upload,
  Star,
  Copy,
  Loader2,
  Settings,
} from "lucide-react";
import DamageCheckTemplateCanvasEditor from "@/pages/settings/damage-check-template-editor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DamageCheckTemplate {
  id: number;
  name: string;
  description: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleType: string | null;
  buildYearFrom: string | null;
  buildYearTo: string | null;
  headerText: string | null;
  footerText: string | null;
  isDefault: boolean;
  language: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Templates list page
// ---------------------------------------------------------------------------

export default function DamageCheckTemplates({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation("settings");
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"list" | "edit">("list");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataTemplate, setMetadataTemplate] = useState<DamageCheckTemplate | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<DamageCheckTemplate | null>(null);
  const [clonePickerOpen, setClonePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery<DamageCheckTemplate[]>({
    queryKey: ["/api/damage-check-templates"],
  });

  const handleCreateNew = () => {
    setMetadataTemplate(null);
    setMetadataDialogOpen(true);
  };

  const handleEditMetadata = (template: DamageCheckTemplate) => {
    setMetadataTemplate(template);
    setMetadataDialogOpen(true);
  };

  const handleEdit = (template: DamageCheckTemplate) => {
    setEditingTemplateId(template.id);
    setViewMode("edit");
  };

  const handleDeleteClick = (template: DamageCheckTemplate) => {
    setTemplateToDelete(template);
    setDeleteConfirmOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/damage-check-templates/${id}`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: t('damageCheckTemplatesPage.toasts.successTitle'), description: t('damageCheckTemplatesPage.toasts.templateDeletedDescription') });
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('damageCheckTemplatesPage.toasts.errorTitle'),
        description: error.message || t('damageCheckTemplatesPage.toasts.deleteFailedFallback'),
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/damage-check-templates/${id}/set-default`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: t('damageCheckTemplatesPage.toasts.defaultUpdatedTitle'), description: t('damageCheckTemplatesPage.toasts.defaultUpdatedDescription') });
    },
    onError: (error: Error) => {
      toast({
        title: t('damageCheckTemplatesPage.toasts.errorTitle'),
        description: error.message || t('damageCheckTemplatesPage.toasts.setDefaultFailedFallback'),
        variant: "destructive",
      });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (payload: { id: number; name?: string }) => {
      return await apiRequest(
        "POST",
        `/api/damage-check-templates/${payload.id}/clone`,
        payload.name ? { name: payload.name } : {},
      );
    },
    onSuccess: () => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: t('damageCheckTemplatesPage.toasts.clonedTitle'), description: t('damageCheckTemplatesPage.toasts.clonedDescription') });
      setClonePickerOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('damageCheckTemplatesPage.toasts.errorTitle'),
        description: error.message || t('damageCheckTemplatesPage.toasts.cloneFailedFallback'),
        variant: "destructive",
      });
    },
  });

  const handleExportTemplate = async (template: DamageCheckTemplate) => {
    try {
      const response = await fetch(`/api/damage-check-templates/${template.id}/export`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(t('damageCheckTemplatesPage.toasts.exportFailed'));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sanitizedName = template.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);
      a.download = `damage_check_${sanitizedName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: t('damageCheckTemplatesPage.toasts.successTitle'), description: t('damageCheckTemplatesPage.toasts.templateExportedDescription') });
    } catch (error) {
      console.error("Error exporting template:", error);
      toast({ title: t('damageCheckTemplatesPage.toasts.errorTitle'), description: t('damageCheckTemplatesPage.toasts.exportFailedDescription'), variant: "destructive" });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const templateData = JSON.parse(text);
      await apiRequest("POST", "/api/damage-check-templates/import", templateData);
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: t('damageCheckTemplatesPage.toasts.successTitle'), description: t('damageCheckTemplatesPage.toasts.templateImportedDescription') });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      console.error("Error importing template:", error);
      toast({
        title: t('damageCheckTemplatesPage.toasts.errorTitle'),
        description: error.message || t('damageCheckTemplatesPage.toasts.importFailedFallback'),
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (viewMode === "edit" && editingTemplateId != null) {
    return (
      <DamageCheckTemplateCanvasEditor
        embedded
        templateId={editingTemplateId}
        onBack={() => {
          setViewMode("list");
          setEditingTemplateId(null);
        }}
      />
    );
  }

  return (
    <div className={embedded ? "p-4 md:p-6" : "container mx-auto p-6 max-w-7xl"}>
      <div className="flex justify-between items-center mb-6">
        <div>
          {!embedded && (
            <>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Car className="h-8 w-8" />
                {t('damageCheckTemplatesPage.pageTitle')}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t('damageCheckTemplatesPage.pageDescription')}
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button
            onClick={() => setClonePickerOpen(true)}
            variant="outline"
            className="gap-2"
            disabled={templates.length === 0}
            data-testid="button-open-clone-picker"
          >
            <Copy className="h-4 w-4" />
            {t('damageCheckTemplatesPage.cloneFromExistingButton')}
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="gap-2"
            data-testid="button-import-template"
          >
            <Upload className="h-4 w-4" />
            {t('damageCheckTemplatesPage.importTemplateButton')}
          </Button>
          <Button onClick={handleCreateNew} className="gap-2" data-testid="button-create-template">
            <Plus className="h-4 w-4" />
            {t('damageCheckTemplatesPage.createTemplateButton')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('damageCheckTemplatesPage.loadingTemplates')}
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Car className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('damageCheckTemplatesPage.noTemplatesCreatedTitle')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('damageCheckTemplatesPage.noTemplatesCreatedDescription')}
            </p>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              {t('damageCheckTemplatesPage.createFirstTemplateButton')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            return (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {template.name}
                        {template.isDefault && (
                          <Badge variant="default" className="text-xs">
                            {t('damageCheckTemplatesPage.defaultBadge')}
                          </Badge>
                        )}
                      </CardTitle>
                      {template.description && (
                        <CardDescription className="mt-1">{template.description}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <div className="font-medium text-gray-700 mb-1">{t('damageCheckTemplatesPage.vehicleTargetLabel')}</div>
                      {template.vehicleMake || template.vehicleModel || template.vehicleType ? (
                        <div className="flex flex-wrap gap-1">
                          {template.vehicleMake && (
                            <Badge variant="outline" className="text-xs">
                              {template.vehicleMake}
                            </Badge>
                          )}
                          {template.vehicleModel && (
                            <Badge variant="outline" className="text-xs">
                              {template.vehicleModel}
                            </Badge>
                          )}
                          {template.vehicleType && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {template.vehicleType}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 italic">{t('damageCheckTemplatesPage.genericAllVehicles')}</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                        className="flex-1 min-w-[80px]"
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        {t('damageCheckTemplatesPage.editButton')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditMetadata(template)}
                        data-testid={`button-settings-template-${template.id}`}
                        title={t('damageCheckTemplatesPage.templateSettingsTitle')}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                      {!template.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(template.id)}
                          disabled={setDefaultMutation.isPending}
                          data-testid={`button-set-default-${template.id}`}
                          title={t('damageCheckTemplatesPage.setAsDefaultTitle')}
                        >
                          <Star className="h-3.5 w-3.5 mr-1" />
                          {t('damageCheckTemplatesPage.setDefaultButton')}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportTemplate(template)}
                        data-testid={`button-export-template-${template.id}`}
                        title={t('damageCheckTemplatesPage.exportToJsonTitle')}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(template)}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TemplateMetadataDialog
        open={metadataDialogOpen}
        onOpenChange={setMetadataDialogOpen}
        template={metadataTemplate}
        onSaved={(saved) => {
          if (!metadataTemplate) {
            // Just created — jump straight into the canvas editor for it.
            setEditingTemplateId(saved.id);
            setViewMode("edit");
          }
        }}
      />

      <ClonePickerDialog
        open={clonePickerOpen}
        onOpenChange={setClonePickerOpen}
        templates={templates}
        onConfirm={(id, name) => cloneMutation.mutate({ id, name })}
        isPending={cloneMutation.isPending}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('damageCheckTemplatesPage.deleteTemplateDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('damageCheckTemplatesPage.deleteTemplateDialogDescription', { name: templateToDelete?.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              {t('damageCheckTemplatesPage.cancelButton')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => templateToDelete && deleteMutation.mutate(templateToDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('damageCheckTemplatesPage.deletingButton') : t('damageCheckTemplatesPage.deleteButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clone-from-existing picker (single button at top of list)
// ---------------------------------------------------------------------------

function ClonePickerDialog({
  open,
  onOpenChange,
  templates,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: DamageCheckTemplate[];
  onConfirm: (id: number, name?: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation("settings");
  const [selectedId, setSelectedId] = useState<string>("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedId("");
      setNewName("");
    }
  }, [open]);

  const selected = templates.find((tmpl) => String(tmpl.id) === selectedId);

  useEffect(() => {
    if (selected && !newName.trim()) {
      setNewName(t('damageCheckTemplatesPage.copyNameSuffix', { name: selected.name }));
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('damageCheckTemplatesPage.cloneDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('damageCheckTemplatesPage.cloneDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('damageCheckTemplatesPage.sourceTemplateLabel')}</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger data-testid="select-clone-source">
                <SelectValue placeholder={t('damageCheckTemplatesPage.selectTemplatePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tmpl) => (
                  <SelectItem key={tmpl.id} value={String(tmpl.id)}>
                    {tmpl.name}
                    {tmpl.isDefault ? t('damageCheckTemplatesPage.defaultSuffix') : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('damageCheckTemplatesPage.newTemplateNameLabel')}</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('damageCheckTemplatesPage.newTemplateNamePlaceholder')}
              data-testid="input-clone-name"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('damageCheckTemplatesPage.cancelButton')}
          </Button>
          <Button
            onClick={() => selected && onConfirm(selected.id, newName.trim() || undefined)}
            disabled={!selected || isPending}
            data-testid="button-confirm-clone"
          >
            {isPending ? t('damageCheckTemplatesPage.cloningButton') : t('damageCheckTemplatesPage.cloneButton')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Template metadata — create a template, or edit name/description/vehicle
// targeting/language for an existing one. Layout editing happens separately
// in the canvas editor; this dialog only owns the fields that used to live
// in the deleted structured "Edit Template" form's top section.
// ---------------------------------------------------------------------------

function TemplateMetadataDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DamageCheckTemplate | null;
  onSaved: (saved: DamageCheckTemplate) => void;
}) {
  const { t } = useTranslation("settings");
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [buildYearFrom, setBuildYearFrom] = useState("");
  const [buildYearTo, setBuildYearTo] = useState("");
  const [language, setLanguage] = useState<"nl" | "en">("nl");

  useEffect(() => {
    if (!open) return;
    setName(template?.name || "");
    setDescription(template?.description || "");
    setVehicleMake(template?.vehicleMake || "");
    setVehicleModel(template?.vehicleModel || "");
    setVehicleType(template?.vehicleType || "");
    setBuildYearFrom(template?.buildYearFrom || "");
    setBuildYearTo(template?.buildYearTo || "");
    setLanguage((template?.language as "nl" | "en") || "nl");
  }, [open, template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        vehicleMake: vehicleMake.trim() || null,
        vehicleModel: vehicleModel.trim() || null,
        vehicleType: vehicleType || null,
        buildYearFrom: buildYearFrom.trim() || null,
        buildYearTo: buildYearTo.trim() || null,
        language,
      };
      const url = template
        ? `/api/damage-check-templates/${template.id}`
        : "/api/damage-check-templates";
      const method = template ? "PUT" : "POST";
      const res = await apiRequest(method, url, data);
      return res.json();
    },
    onSuccess: (saved: DamageCheckTemplate) => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({
        title: t('damageCheckTemplatesPage.toasts.successTitle'),
        description: template ? t('damageCheckTemplatesPage.toasts.templateUpdatedDescription') : t('damageCheckTemplatesPage.toasts.templateCreatedDescription'),
      });
      onOpenChange(false);
      onSaved(saved);
    },
    onError: (error: Error) => {
      toast({
        title: t('damageCheckTemplatesPage.toasts.errorTitle'),
        description: error.message || t('damageCheckTemplatesPage.toasts.saveFailedFallback'),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? t('damageCheckTemplatesPage.templateSettingsTitle') : t('damageCheckTemplatesPage.createTemplateDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('damageCheckTemplatesPage.metadataDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tmd-name">{t('damageCheckTemplatesPage.nameLabel')}</Label>
            <Input
              id="tmd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-metadata-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tmd-description">{t('damageCheckTemplatesPage.descriptionLabel')}</Label>
            <Textarea
              id="tmd-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-metadata-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tmd-make">{t('damageCheckTemplatesPage.vehicleMakeLabel')}</Label>
              <Input
                id="tmd-make"
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                placeholder={t('damageCheckTemplatesPage.vehicleMakePlaceholder')}
                data-testid="input-metadata-make"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-model">{t('damageCheckTemplatesPage.vehicleModelLabel')}</Label>
              <Input
                id="tmd-model"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder={t('damageCheckTemplatesPage.vehicleModelPlaceholder')}
                data-testid="input-metadata-model"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tmd-type">{t('damageCheckTemplatesPage.vehicleTypeLabel')}</Label>
              <Select
                value={vehicleType || "all"}
                onValueChange={(v) => setVehicleType(v === "all" ? "" : v)}
              >
                <SelectTrigger id="tmd-type" data-testid="select-metadata-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('damageCheckTemplatesPage.anyOption')}</SelectItem>
                  <SelectItem value="sedan">{t('damageCheckTemplatesPage.sedanOption')}</SelectItem>
                  <SelectItem value="suv">{t('damageCheckTemplatesPage.suvOption')}</SelectItem>
                  <SelectItem value="van">{t('damageCheckTemplatesPage.vanOption')}</SelectItem>
                  <SelectItem value="truck">{t('damageCheckTemplatesPage.truckOption')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-year-from">{t('damageCheckTemplatesPage.buildYearFromLabel')}</Label>
              <Input
                id="tmd-year-from"
                value={buildYearFrom}
                onChange={(e) => setBuildYearFrom(e.target.value)}
                placeholder="2015"
                data-testid="input-metadata-year-from"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-year-to">{t('damageCheckTemplatesPage.buildYearToLabel')}</Label>
              <Input
                id="tmd-year-to"
                value={buildYearTo}
                onChange={(e) => setBuildYearTo(e.target.value)}
                placeholder="2020"
                data-testid="input-metadata-year-to"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tmd-language">{t('damageCheckTemplatesPage.languageLabel')}</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as "nl" | "en")}>
              <SelectTrigger id="tmd-language" data-testid="select-metadata-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">{t('damageCheckTemplatesPage.dutchOption')}</SelectItem>
                <SelectItem value="en">{t('damageCheckTemplatesPage.englishOption')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('damageCheckTemplatesPage.cancelButton')}
          </Button>
          <Button
            onClick={() => name.trim() && saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
            data-testid="button-save-metadata"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {template ? t('damageCheckTemplatesPage.saveButton') : t('damageCheckTemplatesPage.createButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
