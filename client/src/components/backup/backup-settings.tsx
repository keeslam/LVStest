import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Settings, HardDrive, Cloud, Clock, Database } from "lucide-react";
import { BackupSettings } from "@shared/schema";

const backupSettingsSchema = z.object({
  storageType: z.enum(["object_storage", "local_filesystem"]),
  localPath: z.string().optional(),
  enableAutoBackup: z.boolean(),
  backupSchedule: z.string(),
  retentionDays: z.number().min(1).max(365),
  settings: z.record(z.any()).optional()
});

type BackupSettingsForm = z.infer<typeof backupSettingsSchema>;

interface BackupSettingsProps {
  onSettingsChange?: () => void;
}

export function BackupSettingsPanel({ onSettingsChange }: BackupSettingsProps) {
  const { t } = useTranslation("settings");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current backup settings
  const { data: backupSettings, isLoading } = useQuery<BackupSettings>({
    queryKey: ['/api/backup-settings'],
    queryFn: async () => {
      const response = await fetch('/api/backup-settings');
      if (!response.ok) {
        // If no settings exist, return default settings
        if (response.status === 404) {
          return {
            storageType: 'object_storage',
            enableAutoBackup: true,
            backupSchedule: '0 2 * * *',
            retentionDays: 30,
            settings: {}
          } as BackupSettings;
        }
        throw new Error('Failed to fetch backup settings');
      }
      return await response.json();
    }
  });

  const form = useForm<BackupSettingsForm>({
    resolver: zodResolver(backupSettingsSchema),
    values: backupSettings ? {
      storageType: backupSettings.storageType as "object_storage" | "local_filesystem",
      localPath: backupSettings.localPath || '',
      enableAutoBackup: backupSettings.enableAutoBackup,
      backupSchedule: backupSettings.backupSchedule,
      retentionDays: backupSettings.retentionDays,
      settings: backupSettings.settings
    } : undefined
  });

  // Save backup settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: BackupSettingsForm) => {
      const method = backupSettings?.id ? 'PUT' : 'POST';
      const url = backupSettings?.id ? `/api/backup-settings/${backupSettings.id}` : '/api/backup-settings';

      const response = await apiRequest(method, url, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save backup settings');
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: t('backupSettingsPanel.toasts.settingsSavedTitle'),
        description: t('backupSettingsPanel.toasts.settingsSavedDescription'),
      });
      invalidateByPrefix('/api/backup-settings');
      onSettingsChange?.();
    },
    onError: (error: Error) => {
      toast({
        title: t('backupSettingsPanel.toasts.saveFailedTitle'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: BackupSettingsForm) => {
    saveSettingsMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            {t('backupSettingsPanel.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">{t('backupSettingsPanel.loadingSettings')}</div>
        </CardContent>
      </Card>
    );
  }

  const storageType = form.watch("storageType");
  const scheduleDescriptions: Record<string, string> = {
    '0 2 * * *': t('backupSettingsPanel.scheduleDaily'),
    '0 2 * * 0': t('backupSettingsPanel.scheduleWeekly'),
    '0 2 1 * *': t('backupSettingsPanel.scheduleMonthly'),
    '0 */6 * * *': t('backupSettingsPanel.scheduleEvery6Hours')
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings className="w-5 h-5 mr-2" />
          {t('backupSettingsPanel.title')}
        </CardTitle>
        <CardDescription>
          {t('backupSettingsPanel.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs value={storageType} onValueChange={(value) => 
            form.setValue("storageType", value as "object_storage" | "local_filesystem")
          }>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="object_storage" className="flex items-center">
                <Cloud className="w-4 h-4 mr-2" />
                {t('backupSettingsPanel.cloudStorageTab')}
              </TabsTrigger>
              <TabsTrigger value="local_filesystem" className="flex items-center">
                <HardDrive className="w-4 h-4 mr-2" />
                {t('backupSettingsPanel.localFilesystemTab')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="object_storage" className="space-y-4">
              <div className="p-4 border rounded-lg bg-blue-50">
                <h4 className="font-medium flex items-center">
                  <Cloud className="w-4 h-4 mr-2" />
                  {t('backupSettingsPanel.replitObjectStorageTitle')}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('backupSettingsPanel.replitObjectStorageDescription')}
                </p>
                <div className="mt-2 text-sm">
                  <div>{t('backupSettingsPanel.automaticRedundancy')}</div>
                  <div>{t('backupSettingsPanel.noDiskSpaceUsage')}</div>
                  <div>{t('backupSettingsPanel.accessFromAnywhere')}</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="local_filesystem" className="space-y-4">
              <div className="p-4 border rounded-lg bg-orange-50">
                <h4 className="font-medium flex items-center">
                  <HardDrive className="w-4 h-4 mr-2" />
                  {t('backupSettingsPanel.localFileSystemTitle')}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('backupSettingsPanel.localFileSystemDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="localPath">{t('backupSettingsPanel.backupDirectoryPathLabel')}</Label>
                <Input
                  id="localPath"
                  {...form.register("localPath")}
                  placeholder="/backups or /mnt/external-drive/backups"
                  className="font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('backupSettingsPanel.backupDirectoryPathHint')}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t('backupSettingsPanel.automaticBackupsLabel')}</Label>
                <div className="text-sm text-muted-foreground">
                  {t('backupSettingsPanel.automaticBackupsHint')}
                </div>
              </div>
              <Switch
                checked={form.watch("enableAutoBackup")}
                onCheckedChange={(checked) => form.setValue("enableAutoBackup", checked)}
              />
            </div>

            {form.watch("enableAutoBackup") && (
              <div className="space-y-2">
                <Label htmlFor="backupSchedule">{t('backupSettingsPanel.backupScheduleLabel')}</Label>
                <Select
                  value={form.watch("backupSchedule")}
                  onValueChange={(value) => form.setValue("backupSchedule", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('backupSettingsPanel.selectBackupFrequencyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0 2 * * *">
                      <div className="flex items-center justify-between w-full">
                        <span>{t('backupSettingsPanel.scheduleDaily')}</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                    <SelectItem value="0 2 * * 0">
                      <div className="flex items-center justify-between w-full">
                        <span>{t('backupSettingsPanel.scheduleWeekly')}</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                    <SelectItem value="0 2 1 * *">
                      <div className="flex items-center justify-between w-full">
                        <span>{t('backupSettingsPanel.scheduleMonthly')}</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                    <SelectItem value="0 */6 * * *">
                      <div className="flex items-center justify-between w-full">
                        <span>{t('backupSettingsPanel.scheduleEvery6Hours')}</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t('backupSettingsPanel.currentSettingLabel', { schedule: scheduleDescriptions[form.watch("backupSchedule")] || t('backupSettingsPanel.customSchedule') })}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="retentionDays">{t('backupSettingsPanel.retentionPeriodLabel')}</Label>
              <Input
                id="retentionDays"
                type="number"
                min="1"
                max="365"
                {...form.register("retentionDays", { valueAsNumber: true })}
              />
              <p className="text-sm text-muted-foreground">
                {t('backupSettingsPanel.retentionPeriodHint')}
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              disabled={saveSettingsMutation.isPending}
            >
              {t('backupSettingsPanel.resetButton')}
            </Button>
            <Button
              type="submit"
              disabled={saveSettingsMutation.isPending}
              data-testid="save-backup-settings"
            >
              {saveSettingsMutation.isPending ? t('backupSettingsPanel.savingButton') : t('backupSettingsPanel.saveSettingsButton')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
