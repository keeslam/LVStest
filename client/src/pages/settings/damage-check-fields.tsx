import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient, getCsrfToken } from "@/lib/queryClient";
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, ArrowUp, ArrowDown, AlertTriangle, Upload, RotateCcw,
} from "lucide-react";
import {
  type DamageCheckFieldsConfig,
  type ChecklistGroupDef,
  type ChecklistFieldDef,
  DEFAULT_DAMAGE_CHECK_FIELDS,
  UserRole,
} from "@shared/schema";

function autoKeyFromLabel(label: string): string {
  const cleaned = label.trim().replace(/\s*\(.*?\)\s*/g, ' ');
  const parts = cleaned.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return `field_${Date.now()}`;
  const first = parts[0].toLowerCase();
  const rest = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
  let key = first + rest;
  if (!/^[a-zA-Z]/.test(key)) key = 'f' + key;
  return key.replace(/[^a-zA-Z0-9_]/g, '');
}

export default function DamageCheckFieldsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === UserRole.ADMIN;

  const { data, isLoading } = useQuery<DamageCheckFieldsConfig>({
    queryKey: ['/api/damage-check-fields'],
  });

  const [config, setConfig] = useState<DamageCheckFieldsConfig>(DEFAULT_DAMAGE_CHECK_FIELDS);
  const [headerCacheBust, setHeaderCacheBust] = useState(Date.now());
  const [uploadingHeader, setUploadingHeader] = useState(false);

  const handleHeaderUpload = async (file: File) => {
    setUploadingHeader(true);
    try {
      const fd = new FormData();
      fd.append('header', file);
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/damage-check-fields/header', {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || t('damageCheckFieldsPage.toasts.uploadFailedFallback'));
      setHeaderCacheBust(Date.now());
      toast({ title: t('damageCheckFieldsPage.toasts.headerUpdatedTitle'), description: t('damageCheckFieldsPage.toasts.headerUpdatedDescription') });
    } catch (err: any) {
      toast({ title: t('damageCheckFieldsPage.toasts.uploadFailedTitle'), description: err?.message || t('damageCheckFieldsPage.toasts.uploadFailedFallback'), variant: 'destructive' });
    } finally {
      setUploadingHeader(false);
    }
  };

  const handleHeaderReset = async () => {
    if (!confirm(t('damageCheckFieldsPage.confirmResetHeader'))) return;
    try {
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/damage-check-fields/header', {
        method: 'DELETE',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      });
      if (!res.ok) throw new Error(t('damageCheckFieldsPage.toasts.resetFailedFallback'));
      setHeaderCacheBust(Date.now());
      toast({ title: t('damageCheckFieldsPage.toasts.headerResetTitle'), description: t('damageCheckFieldsPage.toasts.headerResetDescription') });
    } catch (err: any) {
      toast({ title: t('damageCheckFieldsPage.toasts.resetFailedTitle'), description: err?.message || t('damageCheckFieldsPage.toasts.resetFailedFallback'), variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (data) setConfig(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (cfg: DamageCheckFieldsConfig) => {
      return apiRequest('PUT', '/api/damage-check-fields', cfg);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/damage-check-fields'] });
      toast({ title: t('damageCheckFieldsPage.toasts.savedTitle'), description: t('damageCheckFieldsPage.toasts.savedDescription') });
    },
    onError: (err: any) => {
      toast({
        title: t('damageCheckFieldsPage.toasts.saveFailedTitle'),
        description: err?.message || t('damageCheckFieldsPage.toasts.saveFailedFallback'),
        variant: "destructive",
      });
    },
  });

  const updateGroup = (groupId: ChecklistGroupDef['id'], updater: (g: ChecklistGroupDef) => ChecklistGroupDef) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? updater(g) : g),
    }));
  };

  const updateField = (groupId: ChecklistGroupDef['id'], index: number, patch: Partial<ChecklistFieldDef>) => {
    updateGroup(groupId, g => ({
      ...g,
      fields: g.fields.map((f, i) => i === index ? { ...f, ...patch } : f),
    }));
  };

  const moveField = (groupId: ChecklistGroupDef['id'], index: number, dir: -1 | 1) => {
    updateGroup(groupId, g => {
      const next = [...g.fields];
      const target = index + dir;
      if (target < 0 || target >= next.length) return g;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...g, fields: next };
    });
  };

  const removeField = (groupId: ChecklistGroupDef['id'], index: number) => {
    updateGroup(groupId, g => ({ ...g, fields: g.fields.filter((_, i) => i !== index) }));
  };

  const addField = (groupId: ChecklistGroupDef['id']) => {
    updateGroup(groupId, g => {
      const isDelivery = groupId === 'delivery';
      const baseKey = `newField${g.fields.length + 1}`;
      const newField: ChecklistFieldDef = {
        key: baseKey,
        label: 'New field',
        inputType: isDelivery ? 'checkbox' : 'select',
        options: isDelivery ? [] : ['ja', 'nee'],
      };
      return { ...g, fields: [...g.fields, newField] };
    });
  };

  const handleSave = () => {
    // Surface duplicate-key errors locally so we don't round-trip a 400.
    for (const g of config.groups) {
      const seen = new Set<string>();
      for (const f of g.fields) {
        if (!f.key.trim()) {
          toast({ title: t('damageCheckFieldsPage.toasts.missingKeyTitle'), description: t('damageCheckFieldsPage.toasts.missingKeyDescription', { label: g.label }), variant: "destructive" });
          return;
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key)) {
          toast({ title: t('damageCheckFieldsPage.toasts.invalidKeyTitle'), description: t('damageCheckFieldsPage.toasts.invalidKeyDescription', { key: f.key }), variant: "destructive" });
          return;
        }
        if (seen.has(f.key)) {
          toast({ title: t('damageCheckFieldsPage.toasts.duplicateKeyTitle'), description: t('damageCheckFieldsPage.toasts.duplicateKeyDescription', { key: f.key, label: g.label }), variant: "destructive" });
          return;
        }
        seen.add(f.key);
        if (f.inputType === 'select' && f.options.length === 0) {
          toast({ title: t('damageCheckFieldsPage.toasts.missingOptionsTitle'), description: t('damageCheckFieldsPage.toasts.missingOptionsDescription', { label: f.label }), variant: "destructive" });
          return;
        }
      }
    }
    saveMutation.mutate(config);
  };

  const resetToDefaults = () => {
    if (!confirm(t('damageCheckFieldsPage.confirmResetDefaults'))) return;
    setConfig(DEFAULT_DAMAGE_CHECK_FIELDS);
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> {t('damageCheckFieldsPage.adminAccessRequiredTitle')}
            </CardTitle>
            <CardDescription>
              {t('damageCheckFieldsPage.adminAccessRequiredDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />{t('damageCheckFieldsPage.backToSettingsButton')}</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('damageCheckFieldsPage.loadingLabel')}
      </div>
    );
  }

  return (
    <div className={embedded ? "p-4 md:p-6" : "container mx-auto p-4 md:p-6 max-w-5xl"}>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {!embedded && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-1" /> {t('damageCheckFieldsPage.backButton')}
              </Button>
            )}
            <Badge variant="secondary">{t('damageCheckFieldsPage.adminOnlyBadge')}</Badge>
          </div>
          {!embedded && <h1 className="text-2xl font-bold">{t('damageCheckFieldsPage.pageTitle')}</h1>}
          <p className="text-sm text-muted-foreground mt-1">
            {t('damageCheckFieldsPage.pageDescription')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults} data-testid="button-reset-defaults">{t('damageCheckFieldsPage.resetToDefaultsButton')}</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {t('damageCheckFieldsPage.saveButton')}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('damageCheckFieldsPage.headerImageTitle')}</CardTitle>
            <CardDescription>
              {t('damageCheckFieldsPage.headerImageDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border rounded bg-muted/30 p-2">
              <img
                src={`/api/damage-check-fields/header?t=${headerCacheBust}`}
                alt={t('damageCheckFieldsPage.currentHeaderAlt')}
                className="w-full h-auto block"
                style={{ maxHeight: 120, objectFit: 'contain' }}
                onError={(e) => {
                  // No header configured yet: show a hint instead of a broken image.
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  const hint = img.nextElementSibling as HTMLElement | null;
                  if (hint) hint.style.display = 'block';
                }}
              />
              <p className="hidden text-sm text-muted-foreground py-4 text-center">
                {t('damageCheckFieldsPage.noHeaderSetHint')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Label htmlFor="header-upload" className="inline-flex">
                <Button asChild variant="outline" disabled={uploadingHeader}>
                  <span className="cursor-pointer">
                    {uploadingHeader ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {t('damageCheckFieldsPage.uploadNewHeaderButton')}
                  </span>
                </Button>
              </Label>
              <input
                id="header-upload"
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleHeaderUpload(f);
                  e.target.value = '';
                }}
                data-testid="input-header-upload"
              />
              <Button variant="outline" onClick={handleHeaderReset} data-testid="button-header-reset">
                <RotateCcw className="h-4 w-4 mr-2" /> {t('damageCheckFieldsPage.resetToDefaultButton')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {config.groups.map((group) => (
          <Card key={group.id} data-testid={`group-${group.id}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{group.label}</span>
                <Badge variant="outline">{group.id}</Badge>
              </CardTitle>
              <CardDescription>
                {group.id === 'delivery'
                  ? t('damageCheckFieldsPage.deliveryGroupDescription')
                  : t('damageCheckFieldsPage.selectGroupDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.fields.length === 0 && (
                <p className="text-sm text-muted-foreground italic">{t('damageCheckFieldsPage.noFieldsYet')}</p>
              )}
              {group.fields.map((field, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-start border rounded-md p-3 bg-muted/30" data-testid={`field-${group.id}-${index}`}>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">{t('damageCheckFieldsPage.labelField')}</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        // If key looks auto-generated (matches previous label slug), regenerate
                        const looksAuto = field.key === autoKeyFromLabel(field.label);
                        updateField(group.id, index, {
                          label: newLabel,
                          ...(looksAuto ? { key: autoKeyFromLabel(newLabel) || field.key } : {}),
                        });
                      }}
                      data-testid={`input-label-${group.id}-${index}`}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Label className="text-xs">{t('damageCheckFieldsPage.keyField')}</Label>
                    <Input
                      value={field.key}
                      onChange={(e) => updateField(group.id, index, { key: e.target.value })}
                      className="font-mono text-xs"
                      data-testid={`input-key-${group.id}-${index}`}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Label className="text-xs">{t('damageCheckFieldsPage.typeField')}</Label>
                    <Select
                      value={field.inputType}
                      onValueChange={(val: 'select' | 'checkbox') => updateField(group.id, index, {
                        inputType: val,
                        options: val === 'checkbox' ? [] : (field.options.length ? field.options : ['ja', 'nee']),
                      })}
                    >
                      <SelectTrigger data-testid={`select-type-${group.id}-${index}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="select">{t('damageCheckFieldsPage.selectOption')}</SelectItem>
                        <SelectItem value="checkbox">{t('damageCheckFieldsPage.checkboxOption')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">{t('damageCheckFieldsPage.optionsField')}</Label>
                    <Input
                      value={field.options.join(', ')}
                      disabled={field.inputType === 'checkbox'}
                      placeholder={field.inputType === 'checkbox' ? t('damageCheckFieldsPage.optionsNotUsedPlaceholder') : 'schoon, vuil'}
                      onChange={(e) => updateField(group.id, index, {
                        options: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                      })}
                      data-testid={`input-options-${group.id}-${index}`}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-2 flex items-end justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => moveField(group.id, index, -1)} disabled={index === 0} data-testid={`button-up-${group.id}-${index}`}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => moveField(group.id, index, 1)} disabled={index === group.fields.length - 1} data-testid={`button-down-${group.id}-${index}`}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeField(group.id, index)} className="text-destructive" data-testid={`button-delete-${group.id}-${index}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Separator />
              <Button variant="outline" size="sm" onClick={() => addField(group.id)} data-testid={`button-add-${group.id}`}>
                <Plus className="h-4 w-4 mr-2" /> {t('damageCheckFieldsPage.addFieldToGroupButton', { label: group.label })}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending} size="lg" data-testid="button-save-bottom">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {t('damageCheckFieldsPage.saveChangesButton')}
        </Button>
      </div>
    </div>
  );
}
