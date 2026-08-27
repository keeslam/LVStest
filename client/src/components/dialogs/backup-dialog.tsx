import { useState, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Database, Code, Download, CheckCircle2, Clock, Calendar, AlertCircle, Upload, RotateCcw, FileText, Loader2, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";

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

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupDialog({ open, onOpenChange }: BackupDialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === UserRole.ADMIN;
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
  
  const { data: settings } = useQuery<BackupSettings>({
    queryKey: ['/api/backup-settings'],
    enabled: open && isAdmin,
  });

  const { data: status } = useQuery<BackupStatus>({
    queryKey: ['/api/backups/status'],
    refetchInterval: open && isAdmin ? 30000 : false,
    enabled: open && isAdmin,
  });

  const { data: health } = useQuery<BackupHealth>({
    queryKey: ['/api/backups/health'],
    refetchInterval: open && isAdmin ? 30000 : false,
    enabled: open && isAdmin,
  });

  const { data: recentDatabaseBackups = [] } = useQuery<BackupManifest[]>({
    queryKey: ['/api/backups/list', { type: 'database', limit: 3 }],
    enabled: open && isAdmin,
  });

  const { data: recentFilesBackups = [] } = useQuery<BackupManifest[]>({
    queryKey: ['/api/backups/list', { type: 'files', limit: 3 }],
    enabled: open && isAdmin,
  });

  const toggleAutoBackupMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!settings) throw new Error(t('backupDialog.settingsNotLoaded'));

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

  // Run a backup now - see the matching mutation/comment in
  // pages/admin/backup.tsx for why this exists.
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

  const handleDownloadData = async () => {
    setDownloadingData(true);
    try {
      const response = await fetch('/api/backups/download-data', { method: 'GET' });
      if (!response.ok) throw new Error(t('backupDialog.downloadDataFailed'));

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-data-${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: t('backupDialog.dataDownloadedTitle'), description: t('backupDialog.dataDownloadedDescription') });
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
      const response = await fetch('/api/backups/download-code', { method: 'GET' });
      if (!response.ok) throw new Error(t('backupDialog.downloadCodeFailed'));

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-code-${new Date().toISOString().split('T')[0]}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: t('backupDialog.codeDownloadedTitle'), description: t('backupDialog.codeDownloadedDescription') });
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

  const handleDownloadFiles = async () => {
    setDownloadingFiles(true);
    try {
      const response = await fetch('/api/backups/download-files', { method: 'GET' });
      if (!response.ok) throw new Error(t('backupDialog.downloadFilesFailed'));

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-files-${new Date().toISOString().split('T')[0]}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: t('backupDialog.filesDownloadedTitle'), description: t('backupDialog.filesDownloadedDescription') });
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
        description: result.safetyBackupFilename
          ? t('backupDialog.dataRestoredWithSafetyDescription', { filename: result.safetyBackupFilename })
          : t('backupDialog.dataRestoredDescription'),
        duration: 10000,
      });

      setSelectedDataFile(null);
      setTimeout(() => window.location.reload(), 3000);
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
      const response = await fetch(`/api/backups/download/${filename}`, { method: 'GET' });
      if (!response.ok) throw new Error(t('backupDialog.downloadBackupFailed'));

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: t('backupDialog.backupDownloadedTitle'), description: t('backupDialog.backupDownloadedDescription', { filename }) });
    } catch (error) {
      toast({
        title: t('backupDialog.downloadFailedTitle'),
        description: error instanceof Error ? error.message : t('backupDialog.downloadBackupFailed'),
        variant: 'destructive',
      });
    }
  };

  // Restore an existing automated database backup in place. This overwrites
  // the live database. The server takes and verifies a fresh safety backup
  // of current state before it touches anything, and separately requires the
  // typed filename to match exactly - both are enforced server-side, but the
  // UI mirrors the confirmation requirement so the button can't be clicked
  // prematurely.
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
      setTimeout(() => window.location.reload(), 3000);
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

  if (!isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('backupDialog.accessDeniedTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">{t('backupDialog.accessDeniedMessage')}</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Database className="h-6 w-6" />
            {t('backupDialog.title')}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-100px)] px-6 pb-6">
          <div className="space-y-6 pt-4">
            {/* Automatic Backup Schedule */}
            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-purple-900">{t('backupDialog.scheduleTitle')}</CardTitle>
                      <CardDescription className="text-purple-700">
                        {t('backupDialog.scheduleDescription')}
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
                      data-testid="dialog-run-backup-now-button"
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
                        id="auto-backup-dialog"
                        checked={settings?.enableAutoBackup ?? false}
                        onCheckedChange={(checked) => toggleAutoBackupMutation.mutate(checked)}
                        disabled={toggleAutoBackupMutation.isPending || !settings}
                        data-testid="dialog-auto-backup-toggle"
                      />
                      <Label htmlFor="auto-backup-dialog" className="cursor-pointer font-medium text-purple-900">
                        {settings?.enableAutoBackup ? t('backupDialog.enabled') : t('backupDialog.disabled')}
                      </Label>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100">
                    <Clock className="h-4 w-4 text-purple-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-600">{t('backupDialog.scheduleLabel')}</p>
                      <p className="font-semibold text-sm text-gray-900">{t('backupDialog.dailyAt2am')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-600">{t('backupDialog.lastBackup')}</p>
                      <p className="font-semibold text-sm text-gray-900">
                        {status?.lastSuccess ? formatDate(status.lastSuccess) : t('backupDialog.never')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100">
                    <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-600">{t('backupDialog.nextBackup')}</p>
                      <p className="font-semibold text-sm text-gray-900">
                        {settings?.enableAutoBackup ? t('backupDialog.tonightAt2am') : t('backupDialog.disabled')}
                      </p>
                    </div>
                  </div>
                </div>
                {status?.lastError && (
                  <div className="mt-3 flex items-start gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-900">{t('backupDialog.lastBackupError')}</p>
                      <p className="text-xs text-red-700">{status.lastError}</p>
                    </div>
                  </div>
                )}
                {health?.backupPath && (
                  <div className={`mt-3 flex items-start gap-2 p-2 rounded-lg border ${
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
                          {t('backupDialog.backupPathNotSet')}
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{t('backupDialog.recentBackupsTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                        <Database className="h-4 w-4 mr-2 text-blue-600" />
                        {t('backupDialog.databaseBackups')}
                      </h3>
                      {recentDatabaseBackups.length === 0 ? (
                        <p className="text-sm text-gray-500">{t('backupDialog.noAutoDatabaseBackups')}</p>
                      ) : (
                        <div className="space-y-2">
                          {recentDatabaseBackups.map((backup, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border">
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
                                  data-testid={`dialog-download-auto-db-${index}`}
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
                                      data-testid={`dialog-restore-auto-db-${index}`}
                                    >
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                      {t('backupDialog.restore')}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-destructive">{t('backupDialog.restoreWarningTitle')}</AlertDialogTitle>
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
                                            data-testid={`dialog-restore-auto-db-confirm-${index}`}
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
                                        data-testid={`dialog-restore-auto-db-confirm-button-${index}`}
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

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-orange-600" />
                        {t('backupDialog.filesBackups')}
                      </h3>
                      {recentFilesBackups.length === 0 ? (
                        <p className="text-sm text-gray-500">{t('backupDialog.noAutoFilesBackups')}</p>
                      ) : (
                        <div className="space-y-2">
                          {recentFilesBackups.map((backup, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border">
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
                                data-testid={`dialog-download-auto-files-${index}`}
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

            {/* Manual Backup & Restore */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('backupDialog.manualTitle')}</h2>
              <div className="grid gap-4 md:grid-cols-3">
                {/* App Data */}
                <Card className="border hover:border-blue-300 transition-colors">
                  <CardHeader className="text-center pb-2">
                    <div className="flex justify-center mb-2">
                      <div className="p-3 bg-blue-100 rounded-full">
                        <Database className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                    <CardTitle className="text-base">{t('backupDialog.appData')}</CardTitle>
                    <CardDescription className="text-xs">{t('backupDialog.appDataDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handleDownloadData}
                      disabled={downloadingData}
                      data-testid="dialog-download-data-button"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {downloadingData ? t('backupDialog.downloading') : t('backupDialog.download')}
                    </Button>

                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {t('backupDialog.restore')}
                      </p>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept=".sql"
                          onChange={(e) => setSelectedDataFile(e.target.files?.[0] || null)}
                          ref={dataFileInputRef}
                          className="text-xs h-8"
                          data-testid="dialog-data-file-input"
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline"
                              size="sm"
                              className="w-full" 
                              disabled={!selectedDataFile || restoringData}
                              data-testid="dialog-restore-data-button"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              {restoringData ? t('backupDialog.restoring') : t('backupDialog.restore')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">{t('backupDialog.dataRestoreWarningTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('backupDialog.dataRestoreWarningBody')}
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
                  </CardContent>
                </Card>

                {/* Uploaded Files */}
                <Card className="border hover:border-orange-300 transition-colors">
                  <CardHeader className="text-center pb-2">
                    <div className="flex justify-center mb-2">
                      <div className="p-3 bg-orange-100 rounded-full">
                        <FileText className="h-6 w-6 text-orange-600" />
                      </div>
                    </div>
                    <CardTitle className="text-base">{t('backupDialog.uploadedFiles')}</CardTitle>
                    <CardDescription className="text-xs">{t('backupDialog.uploadedFilesDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handleDownloadFiles}
                      disabled={downloadingFiles}
                      data-testid="dialog-download-files-button"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {downloadingFiles ? t('backupDialog.downloading') : t('backupDialog.download')}
                    </Button>

                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {t('backupDialog.restore')}
                      </p>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept=".tar.gz,.tgz"
                          onChange={(e) => setSelectedFilesArchive(e.target.files?.[0] || null)}
                          ref={filesInputRef}
                          className="text-xs h-8"
                          data-testid="dialog-files-file-input"
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline"
                              size="sm"
                              className="w-full" 
                              disabled={!selectedFilesArchive || restoringFiles}
                              data-testid="dialog-restore-files-button"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              {restoringFiles ? t('backupDialog.restoring') : t('backupDialog.restore')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">{t('backupDialog.filesRestoreWarningTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('backupDialog.filesRestoreWarningBody')}
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
                  </CardContent>
                </Card>

                {/* App Code */}
                <Card className="border hover:border-green-300 transition-colors">
                  <CardHeader className="text-center pb-2">
                    <div className="flex justify-center mb-2">
                      <div className="p-3 bg-green-100 rounded-full">
                        <Code className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                    <CardTitle className="text-base">{t('backupDialog.appCode')}</CardTitle>
                    <CardDescription className="text-xs">{t('backupDialog.appCodeDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handleDownloadCode}
                      disabled={downloadingCode}
                      data-testid="dialog-download-code-button"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {downloadingCode ? t('backupDialog.downloading') : t('backupDialog.download')}
                    </Button>

                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {t('backupDialog.restore')}
                      </p>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept=".tar.gz,.tgz"
                          onChange={(e) => setSelectedCodeFile(e.target.files?.[0] || null)}
                          ref={codeFileInputRef}
                          className="text-xs h-8"
                          data-testid="dialog-code-file-input"
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline"
                              size="sm"
                              className="w-full" 
                              disabled={!selectedCodeFile || restoringCode}
                              data-testid="dialog-restore-code-button"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              {restoringCode ? t('backupDialog.restoring') : t('backupDialog.restore')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">{t('backupDialog.codeRestoreWarningTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('backupDialog.codeRestoreWarningBody')}
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
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Recovery Instructions */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-blue-900">{t('backupDialog.recoveryInstructionsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-800 space-y-2">
                <p><strong>{t('backupDialog.dataRecoveryLabel')}</strong> {t('backupDialog.dataRecoveryText')}</p>
                <p><strong>{t('backupDialog.codeRecoveryLabel')}</strong> {t('backupDialog.codeRecoveryText')}</p>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
