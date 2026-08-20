import { useState } from "react";
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
        title: 'Settings Saved',
        description: 'Backup settings have been updated successfully.',
      });
      invalidateByPrefix('/api/backup-settings');
      onSettingsChange?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Save Failed',
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
            Backup Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading settings...</div>
        </CardContent>
      </Card>
    );
  }

  const storageType = form.watch("storageType");
  const scheduleDescriptions = {
    '0 2 * * *': 'Daily at 2:00 AM',
    '0 2 * * 0': 'Weekly on Sundays',
    '0 2 1 * *': 'Monthly on the 1st',
    '0 */6 * * *': 'Every 6 hours'
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings className="w-5 h-5 mr-2" />
          Backup Settings
        </CardTitle>
        <CardDescription>
          Configure automatic backups and storage options
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
                Cloud Storage
              </TabsTrigger>
              <TabsTrigger value="local_filesystem" className="flex items-center">
                <HardDrive className="w-4 h-4 mr-2" />
                Local Filesystem
              </TabsTrigger>
            </TabsList>

            <TabsContent value="object_storage" className="space-y-4">
              <div className="p-4 border rounded-lg bg-blue-50">
                <h4 className="font-medium flex items-center">
                  <Cloud className="w-4 h-4 mr-2" />
                  Replit Object Storage
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Store backups securely in Replit's cloud storage
                </p>
                <div className="mt-2 text-sm">
                  <div>✓ Automatic redundancy</div>
                  <div>✓ No disk space usage</div>
                  <div>✓ Access from anywhere</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="local_filesystem" className="space-y-4">
              <div className="p-4 border rounded-lg bg-orange-50">
                <h4 className="font-medium flex items-center">
                  <HardDrive className="w-4 h-4 mr-2" />
                  Local File System
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Store backups on the local filesystem
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="localPath">Backup Directory Path</Label>
                <Input
                  id="localPath"
                  {...form.register("localPath")}
                  placeholder="/backups or /mnt/external-drive/backups"
                  className="font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  The directory where backups will be stored
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Automatic Backups</Label>
                <div className="text-sm text-muted-foreground">
                  Enable scheduled automatic backups
                </div>
              </div>
              <Switch
                checked={form.watch("enableAutoBackup")}
                onCheckedChange={(checked) => form.setValue("enableAutoBackup", checked)}
              />
            </div>

            {form.watch("enableAutoBackup") && (
              <div className="space-y-2">
                <Label htmlFor="backupSchedule">Backup Schedule</Label>
                <Select
                  value={form.watch("backupSchedule")}
                  onValueChange={(value) => form.setValue("backupSchedule", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select backup frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0 2 * * *">
                      <div className="flex items-center justify-between w-full">
                        <span>Daily at 2:00 AM</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                    <SelectItem value="0 2 * * 0">
                      <div className="flex items-center justify-between w-full">
                        <span>Weekly on Sundays</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                    <SelectItem value="0 2 1 * *">
                      <div className="flex items-center justify-between w-full">
                        <span>Monthly on the 1st</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                    <SelectItem value="0 */6 * * *">
                      <div className="flex items-center justify-between w-full">
                        <span>Every 6 hours</span>
                        <Clock className="w-4 h-4 ml-2" />
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Current setting: {scheduleDescriptions[form.watch("backupSchedule") as keyof typeof scheduleDescriptions] || 'Custom schedule'}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="retentionDays">Retention Period (days)</Label>
              <Input
                id="retentionDays"
                type="number"
                min="1"
                max="365"
                {...form.register("retentionDays", { valueAsNumber: true })}
              />
              <p className="text-sm text-muted-foreground">
                Backups older than this will be automatically deleted
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
              Reset
            </Button>
            <Button 
              type="submit" 
              disabled={saveSettingsMutation.isPending}
              data-testid="save-backup-settings"
            >
              {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
