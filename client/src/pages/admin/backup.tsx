import { useState, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";
import { Redirect } from "wouter";
import { Database, Code, Download, CheckCircle2, Clock, Calendar, AlertCircle, Upload, RotateCcw, FileText, Loader2, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";

interface BackupSettings {
  id: number;
  storageType: string;
  enableAutoBackup: boolean;
  backupSchedule: string;
  retentionDays: number;
  localPath: string;
}

interface BackupStatus {
  lastRun?: string;
  lastSuccess?: string;
  lastError?: string;
  isRunning: boolean;
  nextScheduled?: string;
}

interface BackupHealth {
  lastSuccessAt: string | null;
  ageHours: number | null;
  stale: boolean;
  lastError: string | null;
  backupPath?: string;
  backupPathFromEnv?: boolean;
}

interface BackupManifest {
  timestamp: string;
  type: 'database' | 'files';
  filename: string;
  size: number;
  checksum: string;
  metadata?: {
    dbVersion?: string;
    fileCount?: number;
    compressedSize?: number;
    uploaded?: boolean;
  };
}

export default function BackupPage() {
  const { t } = useTranslation(["settings", "common"]);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [downloadingData, setDownloadingData] = useState(false);
  const [downloadingCode, setDownloadingCode] = useState(false);
  const [downloadingFiles, setDownloadingFiles] = useState(false);
  const [restoringData, setRestoringData] = useState(false);
  const [restoringCode, setRestoringCode] = useState(false);
  const [restoringFiles, setRestoringFiles] = useState(false);
  const [restoringAutomatedBackup, setRestoringAutomatedBackup] = useState<string | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState<Record<string, string>>({});
  const [selectedDataFile, setSelectedDataFile] = useState<File | null>(null);
  const [selectedCodeFile, setSelectedCodeFile] = useState<File | null>(null);
  const [selectedFilesArchive, setSelectedFilesArchive] = useState<File | null>(null);
  const dataFileInputRef = useRef<HTMLInputElement>(null);
  const codeFileInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch backup settings
  const { data: settings } = useQuery<BackupSettings>({
    queryKey: ['/api/backup-settings'],
  });

  // Fetch backup status
  const { data: status } = useQuery<BackupStatus>({
    queryKey: ['/api/backups/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch backup health (staleness, resolved backup path)
  const { data: health } = useQuery<BackupHealth>({
    queryKey: ['/api/backups/health'],
    refetchInterval: 30000,
  });

  // Fetch recent backups (last 3 of each type)
  const { data: recentDatabaseBackups = [] } = useQuery<BackupManifest[]>({
    queryKey: ['/api/backups/list', { type: 'database', limit: 3 }],
  });

  const { data: recentFilesBackups = [] } = useQuery<BackupManifest[]>({
    queryKey: ['/api/backups/list', { type: 'files', limit: 3 }],
  });

  // Toggle auto backup mutation
  const toggleAutoBackupMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!settings) throw new Error('Settings not loaded');
      
      const response = await apiRequest('PUT', `/api/backup-settings/${settings.id}`, {
        enableAutoBackup: enabled,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('backupDialog.updateSettingsFailed'));
      }

      return await response.json();
    },
    onSuccess: (data) => {
      invalidateByPrefix('/api/backup-settings');
      toast({
        title: data.enableAutoBackup ? t('backupDialog.autoBackupEnabledTitle') : t('backupDialog.autoBackupDisabledTitle'),
        description: data.enableAutoBackup
          ? t('backupDialog.autoBackupEnabledDescription')
          : t('backupDialog.autoBackupDisabledDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('backupDialog.updateFailedTitle'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Run a backup now. This is the only way to trigger one from the UI - it
  // previously only ran on the 2:00 AM schedule or a boot-time catch-up, so
  // there was no manual "back up now" a user in a hurry could reach for.
  // Takes a while (pg_dump + archiving + read-back verification of both), so
  // the button shows a spinner rather than looking hung.
  const runBackupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/backups/run');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('backupDialog.runBackupFailed'));
      }

      return await response.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/backups');
      toast({
        title: t('backupDialog.backupCompleteTitle'),
        description: t('backupDialog.backupCompleteDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('backupDialog.backupFailedTitle'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (user.role !== UserRole.ADMIN) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('backupDialog.accessDeniedTitle')}</h1>
          <p className="text-gray-600">{t('backupPage.accessDeniedMessage')}</p>
        </div>
      </div>
    );
  }

  const handleDownloadData = async () => {
    setDownloadingData(true);
    try {
      const response = await fetch('/api/backups/download-data', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(t('backupDialog.downloadDataFailed'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-data-${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('backupDialog.dataDownloadedTitle'),
        description: t('backupDialog.dataDownloadedDescription'),
      });
    } catch (error) {
      toast({
        title: t('backupDialog.downloadFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.downloadDataFailed'),
        variant: 'destructive',
      });
    } finally {
      setDownloadingData(false);
    }
  };

  const handleDownloadCode = async () => {
    setDownloadingCode(true);
    try {
      const response = await fetch('/api/backups/download-code', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(t('backupDialog.downloadCodeFailed'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-code-${new Date().toISOString().split('T')[0]}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('backupDialog.codeDownloadedTitle'),
        description: t('backupDialog.codeDownloadedDescription'),
      });
    } catch (error) {
      toast({
        title: t('backupDialog.downloadFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.downloadCodeFailed'),
        variant: 'destructive',
      });
    } finally {
      setDownloadingCode(false);
    }
  };

  const handleRestoreData = async () => {
    if (!selectedDataFile) return;
    
    setRestoringData(true);
    try {
      const formData = new FormData();
      formData.append('backup', selectedDataFile);

      const response = await fetch('/api/backups/restore-data', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('backupDialog.restoreDataFailed'));
      }

      const result = await response.json();

      toast({
        title: t('backupDialog.dataRestoredTitle'),
        description: '⚠️ ' + (result.safetyBackupFilename
          ? t('backupDialog.dataRestoredWithSafetyDescription', { filename: result.safetyBackupFilename })
          : t('backupDialog.dataRestoredDescription')),
        duration: 10000,
      });

      setSelectedDataFile(null);

      // Wait a moment then reload the page
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      toast({
        title: t('backupDialog.restoreFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.restoreDataFailed'),
        variant: 'destructive',
      });
    } finally {
      setRestoringData(false);
    }
  };

  const handleRestoreCode = async () => {
    if (!selectedCodeFile) return;
    
    setRestoringCode(true);
    try {
      const formData = new FormData();
      formData.append('backup', selectedCodeFile);

      const response = await fetch('/api/backups/restore-code', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('backupDialog.restoreCodeFailed'));
      }

      const result = await response.json();

      toast({
        title: t('backupDialog.codeRestoredTitle'),
        description: result.message || t('backupDialog.codeRestoredDefaultDescription'),
        duration: 10000,
      });

      setSelectedCodeFile(null);
    } catch (error) {
      toast({
        title: t('backupDialog.restoreFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.restoreCodeFailed'),
        variant: 'destructive',
      });
    } finally {
      setRestoringCode(false);
    }
  };

  const handleDownloadFiles = async () => {
    setDownloadingFiles(true);
    try {
      const response = await fetch('/api/backups/download-files', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(t('backupDialog.downloadFilesFailed'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-files-${new Date().toISOString().split('T')[0]}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('backupDialog.filesDownloadedTitle'),
        description: t('backupDialog.filesDownloadedDescription'),
      });
    } catch (error) {
      toast({
        title: t('backupDialog.downloadFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.downloadFilesFailed'),
        variant: 'destructive',
      });
    } finally {
      setDownloadingFiles(false);
    }
  };

  const handleRestoreFiles = async () => {
    if (!selectedFilesArchive) return;
    
    setRestoringFiles(true);
    try {
      const formData = new FormData();
      formData.append('backup', selectedFilesArchive);

      const response = await fetch('/api/backups/restore-files', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('backupDialog.restoreFilesFailed'));
      }

      const result = await response.json();

      toast({
        title: t('backupDialog.filesRestoredTitle'),
        description: result.safetyBackupFilename
          ? t('backupDialog.filesRestoredWithSafetyDescription', { message: result.message || t('backupDialog.filesRestoredDefaultDescription'), filename: result.safetyBackupFilename })
          : result.message || t('backupDialog.filesRestoredDefaultDescription'),
      });

      setSelectedFilesArchive(null);
    } catch (error) {
      toast({
        title: t('backupDialog.restoreFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.restoreFilesFailed'),
        variant: 'destructive',
      });
    } finally {
      setRestoringFiles(false);
    }
  };

  const handleDownloadAutomatedBackup = async (filename: string) => {
    try {
      const response = await fetch(`/api/backups/download/${filename}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(t('backupDialog.downloadBackupFailed'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('backupDialog.backupDownloadedTitle'),
        description: t('backupDialog.backupDownloadedDescription', { filename }),
      });
    } catch (error) {
      toast({
        title: t('backupDialog.downloadFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.downloadBackupFailed'),
        variant: 'destructive',
      });
    }
  };

  // Restore an existing automated database backup in place. This is the most
  // destructive action on this page: it overwrites the live database. The
  // server takes and verifies a fresh safety backup of current state before
  // it touches anything, and separately requires the typed filename to match
  // exactly - both are enforced server-side, but the UI mirrors the
  // confirmation requirement so the button can't even be clicked prematurely.
  const handleRestoreAutomatedDatabaseBackup = async (filename: string) => {
    setRestoringAutomatedBackup(filename);
    try {
      const response = await apiRequest('POST', '/api/backups/restore/database', {
        filename,
        confirmFilename: restoreConfirmText[filename] ?? '',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('backupDialog.restoreBackupFailed'));
      }

      const result = await response.json();
      const base = result.message || t('backupDialog.databaseRestoredDefaultDescription', { filename });
      toast({
        title: t('backupDialog.databaseRestoredTitle'),
        description: result.safetyBackupFilename
          ? t('backupDialog.databaseRestoredWithSafetyDescription', { message: base, filename: result.safetyBackupFilename })
          : base,
        duration: 10000,
      });

      setRestoreConfirmText((prev) => ({ ...prev, [filename]: '' }));

      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      toast({
        title: t('backupDialog.restoreFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.restoreBackupFailed'),
        variant: 'destructive',
      });
    } finally {
      setRestoringAutomatedBackup(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('backupDialog.never');
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return t('backupDialog.unknownDate');
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('backupPage.title')}</h1>
          <p className="text-gray-600 mt-2">
            {t('backupPage.subtitle')}
          </p>
        </div>

        {/* Automatic Backup Schedule */}
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-lg text-purple-900">{t('backupDialog.scheduleTitle')}</CardTitle>
                  <CardDescription className="text-purple-700">
                    {t('backupPage.scheduleDescriptionFull')}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => runBackupMutation.mutate()}
                  disabled={runBackupMutation.isPending || status?.isRunning}
                  data-testid="run-backup-now-button"
                >
                  {runBackupMutation.isPending || status?.isRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-2" />
                  )}
                  {runBackupMutation.isPending || status?.isRunning ? t('backupDialog.backingUp') : t('backupDialog.backUpNow')}
                </Button>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-backup"
                    checked={settings?.enableAutoBackup ?? false}
                    onCheckedChange={(checked) => toggleAutoBackupMutation.mutate(checked)}
                    disabled={toggleAutoBackupMutation.isPending || !settings}
                    data-testid="auto-backup-toggle"
                  />
                  <Label htmlFor="auto-backup" className="cursor-pointer font-medium text-purple-900">
                    {settings?.enableAutoBackup ? t('backupDialog.enabled') : t('backupDialog.disabled')}
                  </Label>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-100">
                <Clock className="h-5 w-5 text-purple-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600">{t('backupDialog.scheduleLabel')}</p>
                  <p className="font-semibold text-gray-900">{t('backupDialog.dailyAt2am')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-100">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600">{t('backupDialog.lastBackup')}</p>
                  <p className="font-semibold text-gray-900 text-sm">
                    {status?.lastSuccess ? formatDate(status.lastSuccess) : t('backupDialog.never')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-100">
                <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600">{t('backupDialog.nextBackup')}</p>
                  <p className="font-semibold text-gray-900 text-sm">
                    {settings?.enableAutoBackup ? t('backupDialog.tonightAt2am') : t('backupDialog.disabled')}
                  </p>
                </div>
              </div>
            </div>
            {status?.lastError && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-900">{t('backupDialog.lastBackupError')}</p>
                  <p className="text-xs text-red-700">{status.lastError}</p>
                </div>
              </div>
            )}
            {settings?.enableAutoBackup && health?.lastSuccessAt && !health.stale && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-green-800">
                    <strong>{t('backupPage.protectionActiveLabel')}</strong> {t('backupPage.protectionActiveText')}
                  </p>
                </div>
              </div>
            )}
            {health?.backupPath && (
              <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg border ${
                health.backupPathFromEnv
                  ? 'bg-gray-50 border-gray-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                {health.backupPathFromEnv ? (
                  <CheckCircle2 className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className={`text-xs font-medium ${health.backupPathFromEnv ? 'text-gray-700' : 'text-amber-900'}`}>
                    {t('backupDialog.backupLocation')} <span className="font-mono">{health.backupPath}</span>
                  </p>
                  {!health.backupPathFromEnv && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      {t('backupPage.backupPathNotSetFull')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Automated Backups */}
        {(recentDatabaseBackups.length > 0 || recentFilesBackups.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>{t('backupDialog.recentBackupsTitle')}</CardTitle>
              <CardDescription>{t('backupPage.recentBackupsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Database Backups */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <Database className="h-4 w-4 mr-2 text-blue-600" />
                    {t('backupPage.databaseBackupsLast3')}
                  </h3>
                  {recentDatabaseBackups.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('backupDialog.noAutoDatabaseBackups')}</p>
                  ) : (
                    <div className="space-y-2">
                      {recentDatabaseBackups.map((backup, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{backup.filename}</p>
                            <p className="text-xs text-gray-500">
                              {formatDate(backup.timestamp)} • {formatFileSize(backup.size)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadAutomatedBackup(backup.filename)}
                              data-testid={`download-auto-db-${index}`}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              {t('backupDialog.download')}
                            </Button>
                            <AlertDialog onOpenChange={(isOpen) => {
                              if (!isOpen) setRestoreConfirmText((prev) => ({ ...prev, [backup.filename]: '' }));
                            }}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  data-testid={`restore-auto-db-${index}`}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  {t('backupDialog.restore')}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-destructive">{t('backupPage.restoreWarningTitleFull')}</AlertDialogTitle>
                                  <AlertDialogDescription asChild>
                                    <div className="space-y-3">
                                      <p>
                                        <Trans
                                          i18nKey="backupDialog.restoreWarningBody"
                                          ns="settings"
                                          values={{ filename: backup.filename }}
                                          components={{ 1: <strong /> }}
                                        />
                                      </p>
                                      <p>{t('backupDialog.typeFilenameConfirm')}</p>
                                      <Input
                                        value={restoreConfirmText[backup.filename] ?? ''}
                                        onChange={(e) => setRestoreConfirmText((prev) => ({ ...prev, [backup.filename]: e.target.value }))}
                                        placeholder={backup.filename}
                                        data-testid={`restore-auto-db-confirm-${index}`}
                                      />
                                    </div>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleRestoreAutomatedDatabaseBackup(backup.filename)}
                                    disabled={
                                      restoreConfirmText[backup.filename] !== backup.filename ||
                                      restoringAutomatedBackup === backup.filename
                                    }
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    data-testid={`restore-auto-db-confirm-button-${index}`}
                                  >
                                    {restoringAutomatedBackup === backup.filename ? t('backupDialog.restoring') : t('backupDialog.yesRestoreThisBackup')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Files Backups */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-orange-600" />
                    {t('backupPage.filesBackupsLast3')}
                  </h3>
                  {recentFilesBackups.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('backupDialog.noAutoFilesBackups')}</p>
                  ) : (
                    <div className="space-y-2">
                      {recentFilesBackups.map((backup, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{backup.filename}</p>
                            <p className="text-xs text-gray-500">
                              {formatDate(backup.timestamp)} • {formatFileSize(backup.size)}
                              {backup.metadata?.fileCount && ` • ${t('backupDialog.filesCount', { count: backup.metadata.fileCount })}`}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadAutomatedBackup(backup.filename)}
                            data-testid={`download-auto-files-${index}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            {t('backupDialog.download')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manual Download Buttons */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('backupPage.manualSectionTitle')}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* App Data Backup */}
            <Card className="border-2 hover:border-blue-300 transition-colors">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-blue-100 rounded-full">
                    <Database className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <CardTitle className="text-xl">{t('backupPage.appDataCardTitle')}</CardTitle>
                <CardDescription>
                  {t('backupPage.appDataCardDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.appDataBullet1')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.appDataBullet2')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.appDataBullet3')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.appDataBullet4')}</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleDownloadData}
                  disabled={downloadingData}
                  data-testid="download-data-button"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloadingData ? t('backupDialog.downloading') : t('backupPage.downloadAppDataButton')}
                </Button>

                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('backupPage.restoreDataLabel')}
                  </p>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept=".sql"
                      onChange={(e) => setSelectedDataFile(e.target.files?.[0] || null)}
                      ref={dataFileInputRef}
                      className="text-sm"
                      data-testid="data-file-input"
                    />
                    {selectedDataFile && (
                      <p className="text-xs text-gray-600">{t('backupPage.selectedFileLabel', { filename: selectedDataFile.name })}</p>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={!selectedDataFile || restoringData}
                          data-testid="restore-data-button"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {restoringData ? t('backupDialog.restoring') : t('backupPage.restoreDataButton')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive">{t('backupPage.dataRestoreWarningTitleFull')}</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              <p>{t('backupPage.dataRestoreWarningIntro')}</p>
                              <p className="mt-4"><strong>{t('backupPage.whatWillBeReplacedLabel')}</strong></p>
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>{t('backupPage.dataReplaceBullet1')}</li>
                                <li>{t('backupPage.dataReplaceBullet2')}</li>
                                <li>{t('backupPage.dataReplaceBullet3')}</li>
                                <li>{t('backupPage.dataReplaceBullet4')}</li>
                              </ul>
                              <p className="mt-4">{t('backupPage.sessionResetNote')}</p>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleRestoreData}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('backupDialog.yesRestoreData')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  {t('backupPage.uploadSqlHint')}
                </p>
              </CardContent>
            </Card>

            {/* Uploaded Files Backup */}
            <Card className="border-2 hover:border-orange-300 transition-colors">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-orange-100 rounded-full">
                    <FileText className="h-8 w-8 text-orange-600" />
                  </div>
                </div>
                <CardTitle className="text-xl">{t('backupPage.uploadedFilesCardTitle')}</CardTitle>
                <CardDescription>
                  {t('backupPage.uploadedFilesCardDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.filesBullet1')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.filesBullet2')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.filesBullet3')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.filesBullet4')}</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleDownloadFiles}
                  disabled={downloadingFiles}
                  data-testid="download-files-button"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloadingFiles ? t('backupDialog.downloading') : t('backupPage.downloadUploadedFilesButton')}
                </Button>

                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('backupPage.restoreFilesLabel')}
                  </p>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept=".tar.gz,.tgz"
                      onChange={(e) => setSelectedFilesArchive(e.target.files?.[0] || null)}
                      ref={filesInputRef}
                      className="text-sm"
                      data-testid="files-file-input"
                    />
                    {selectedFilesArchive && (
                      <p className="text-xs text-gray-600">{t('backupPage.selectedFileLabel', { filename: selectedFilesArchive.name })}</p>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={!selectedFilesArchive || restoringFiles}
                          data-testid="restore-files-button"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {restoringFiles ? t('backupDialog.restoring') : t('backupPage.restoreFilesButton')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive">{t('backupPage.filesRestoreWarningTitleFull')}</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              <p>{t('backupPage.filesRestoreWarningIntro')}</p>
                              <p className="mt-4"><strong>{t('backupPage.whatWillBeReplacedLabel')}</strong></p>
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>{t('backupPage.filesReplaceBullet1')}</li>
                                <li>{t('backupPage.filesReplaceBullet2')}</li>
                                <li>{t('backupPage.filesReplaceBullet3')}</li>
                                <li>{t('backupPage.filesReplaceBullet4')}</li>
                              </ul>
                              <p className="mt-4"><strong>{t('backupPage.noteLabel')}</strong> {t('backupPage.filesRestoreNote')}</p>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleRestoreFiles}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('backupDialog.yesRestoreFiles')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  {t('backupPage.uploadTarGzHint')}
                </p>
              </CardContent>
            </Card>

            {/* App Code Backup */}
            <Card className="border-2 hover:border-green-300 transition-colors">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-green-100 rounded-full">
                    <Code className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <CardTitle className="text-xl">{t('backupPage.appCodeCardTitle')}</CardTitle>
                <CardDescription>
                  {t('backupPage.appCodeCardDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.codeBullet1')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.codeBullet2')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.codeBullet3')}</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{t('backupPage.codeBullet4')}</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleDownloadCode}
                  disabled={downloadingCode}
                  data-testid="download-code-button"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloadingCode ? t('backupDialog.downloading') : t('backupPage.downloadAppCodeButton')}
                </Button>

                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('backupPage.restoreCodeLabel')}
                  </p>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept=".tar.gz,.tgz"
                      onChange={(e) => setSelectedCodeFile(e.target.files?.[0] || null)}
                      ref={codeFileInputRef}
                      className="text-sm"
                      data-testid="code-file-input"
                    />
                    {selectedCodeFile && (
                      <p className="text-xs text-gray-600">{t('backupPage.selectedFileLabel', { filename: selectedCodeFile.name })}</p>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={!selectedCodeFile || restoringCode}
                          data-testid="restore-code-button"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {restoringCode ? t('backupDialog.restoring') : t('backupPage.restoreCodeButton')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive">{t('backupPage.codeRestoreWarningTitleFull')}</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              <p>{t('backupPage.codeRestoreWarningIntro')}</p>
                              <p className="mt-4"><strong>{t('backupPage.whatWillBeReplacedLabel')}</strong></p>
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>{t('backupPage.codeReplaceBullet1')}</li>
                                <li>{t('backupPage.codeReplaceBullet2')}</li>
                                <li>{t('backupPage.codeReplaceBullet3')}</li>
                              </ul>
                              <p className="mt-4"><strong>{t('backupPage.noteLabel')}</strong> {t('backupPage.codeRestoreNote')}</p>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleRestoreCode}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('backupDialog.yesRestoreCode')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  {t('backupPage.uploadTarGzHint')}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Info Section */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900">{t('backupDialog.recoveryInstructionsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 space-y-2">
            <p><strong>{t('backupPage.recoveryDataStepsLabel')}</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>{t('backupPage.recoveryDataStep1')}</li>
              <li>{t('backupPage.recoveryDataStep2')}</li>
              <li>{t('backupPage.recoveryDataStep3')}</li>
            </ol>

            <p className="mt-4"><strong>{t('backupPage.recoveryCodeStepsLabel')}</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>{t('backupPage.recoveryCodeStep1')}</li>
              <li>{t('backupPage.recoveryCodeStep2')}</li>
              <li>{t('backupPage.recoveryCodeStep3')}</li>
              <li>{t('backupPage.recoveryCodeStep4')}</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
