import { useState, useEffect } from "react";
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
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Upload failed');
      setHeaderCacheBust(Date.now());
      toast({ title: 'Header updated', description: 'New header image uploaded.' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message || 'Could not upload', variant: 'destructive' });
    } finally {
      setUploadingHeader(false);
    }
  };

  const handleHeaderReset = async () => {
    if (!confirm('Reset the header back to the bundled default image?')) return;
    try {
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/damage-check-fields/header', {
        method: 'DELETE',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      });
      if (!res.ok) throw new Error('Reset failed');
      setHeaderCacheBust(Date.now());
      toast({ title: 'Header reset', description: 'Default header restored.' });
    } catch (err: any) {
      toast({ title: 'Reset failed', description: err?.message || 'Could not reset', variant: 'destructive' });
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
      toast({ title: "Saved", description: "Damage check fields updated." });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save changes",
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
          toast({ title: "Missing key", description: `A field in "${g.label}" has no key`, variant: "destructive" });
          return;
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key)) {
          toast({ title: "Invalid key", description: `Field key "${f.key}" must start with a letter and use only letters / digits / underscore`, variant: "destructive" });
          return;
        }
        if (seen.has(f.key)) {
          toast({ title: "Duplicate key", description: `Duplicate field key "${f.key}" in "${g.label}"`, variant: "destructive" });
          return;
        }
        seen.add(f.key);
        if (f.inputType === 'select' && f.options.length === 0) {
          toast({ title: "Missing options", description: `Select field "${f.label}" needs at least one option`, variant: "destructive" });
          return;
        }
      }
    }
    saveMutation.mutate(config);
  };

  const resetToDefaults = () => {
    if (!confirm("Reset all fields back to the original defaults? Your unsaved changes will be lost.")) return;
    setConfig(DEFAULT_DAMAGE_CHECK_FIELDS);
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Admin access required
            </CardTitle>
            <CardDescription>
              You need an admin account to edit the damage check field list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Back to Settings</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
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
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            <Badge variant="secondary">Admin only</Badge>
          </div>
          {!embedded && <h1 className="text-2xl font-bold">Damage Check Fields</h1>}
          <p className="text-sm text-muted-foreground mt-1">
            Edit the checklist used by the interactive damage check and the PDF template editor.
            Changes apply immediately to new checks; existing saved checks keep their original values.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults} data-testid="button-reset-defaults">Reset to defaults</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Header image</CardTitle>
            <CardDescription>
              Shown at the top of every page of the generated damage check PDF and in the template editor preview. Use a wide image (recommended ~1000×113px or similar landscape ratio) so it fills the page width cleanly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border rounded bg-muted/30 p-2">
              <img
                src={`/api/damage-check-fields/header?t=${headerCacheBust}`}
                alt="Current damage check header"
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
                No header image set — damage check PDFs are generated without a branded header.
                Upload one below.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Label htmlFor="header-upload" className="inline-flex">
                <Button asChild variant="outline" disabled={uploadingHeader}>
                  <span className="cursor-pointer">
                    {uploadingHeader ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload new header
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
                <RotateCcw className="h-4 w-4 mr-2" /> Reset to default
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
                  ? 'Checkbox items shown in the Aflever Check column.'
                  : 'Select-type questions (label + chosen value).'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.fields.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No fields yet.</p>
              )}
              {group.fields.map((field, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-start border rounded-md p-3 bg-muted/30" data-testid={`field-${group.id}-${index}`}>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">Label</Label>
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
                    <Label className="text-xs">Key</Label>
                    <Input
                      value={field.key}
                      onChange={(e) => updateField(group.id, index, { key: e.target.value })}
                      className="font-mono text-xs"
                      data-testid={`input-key-${group.id}-${index}`}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={field.inputType}
                      onValueChange={(val: 'select' | 'checkbox') => updateField(group.id, index, {
                        inputType: val,
                        options: val === 'checkbox' ? [] : (field.options.length ? field.options : ['ja', 'nee']),
                      })}
                    >
                      <SelectTrigger data-testid={`select-type-${group.id}-${index}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="select">Select</SelectItem>
                        <SelectItem value="checkbox">Checkbox</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">Options (comma-separated)</Label>
                    <Input
                      value={field.options.join(', ')}
                      disabled={field.inputType === 'checkbox'}
                      placeholder={field.inputType === 'checkbox' ? '— not used —' : 'schoon, vuil'}
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
                <Plus className="h-4 w-4 mr-2" /> Add field to {group.label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending} size="lg" data-testid="button-save-bottom">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
