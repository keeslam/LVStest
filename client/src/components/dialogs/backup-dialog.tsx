import { useState, useRef } from "react";
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
import { Database, Code, Download, CheckCircle2, Clock, Calendar, AlertCircle, Upload, RotateCcw, FileText } from "lucide-react";
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
      if (!settings) throw new Error('Settings not loaded');
      
      const response = await apiRequest('PUT', `/api/backup-settings/${settings.id}`, {
        enableAutoBackup: enabled,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update settings');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      invalidateByPrefix('/api/backup-settings');
      toast({
        title: data.enableAutoBackup ? 'Auto Backup Enabled' : 'Auto Backup Disabled',
        description: data.enableAutoBackup 
          ? 'Daily backups will run automatically at 2:00 AM' 
          : 'Automatic backups have been disabled',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDownloadData = async () => {
    setDownloadingData(true);
    try {
      const response = await fetch('/api/backups/download-data', { method: 'GET' });
      if (!response.ok) throw new Error('Failed to download data backup');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-data-${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Data Downloaded', description: 'Your app data has been downloaded successfully.' });
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: error instanceof Error ? error.message : 'Failed to download data',
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
      if (!response.ok) throw new Error('Failed to download code backup');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-code-${new Date().toISOString().split('T')[0]}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Code Downloaded', description: 'Your app code has been downloaded successfully.' });
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: error instanceof Error ? error.message : 'Failed to download code',
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
      if (!response.ok) throw new Error('Failed to download files backup');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `car-rental-files-${new Date().toISOString().split('T')[0]}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Files Downloaded', description: 'Your uploaded files have been downloaded successfully.' });
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: error instanceof Error ? error.message : 'Failed to download files',
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
        throw new Error(error.error || 'Failed to restore data');
      }

      toast({
        title: 'Data Restored',
        description: 'Your database has been restored. Please refresh your browser and log in again.',
        duration: 10000,
      });
      
      setSelectedDataFile(null);
      setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: error instanceof Error ? error.message : 'Failed to restore data',
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
        throw new Error(error.error || 'Failed to restore code');
      }

      const result = await response.json();
      toast({
        title: 'Code Restored',
        description: result.message || 'Code files have been restored. The application will restart.',
        duration: 10000,
      });
      
      setSelectedCodeFile(null);
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: error instanceof Error ? error.message : 'Failed to restore code',
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
        throw new Error(error.error || 'Failed to restore files');
      }

      const result = await response.json();
      toast({
        title: 'Files Restored',
        description: result.message || 'All uploaded files have been restored successfully.',
      });
      
      setSelectedFilesArchive(null);
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: error instanceof Error ? error.message : 'Failed to restore files',
        variant: 'destructive',
      });
    } finally {
      setRestoringFiles(false);
    }
  };

  const handleDownloadAutomatedBackup = async (filename: string) => {
    try {
      const response = await fetch(`/api/backups/download/${filename}`, { method: 'GET' });
      if (!response.ok) throw new Error('Failed to download backup');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Backup Downloaded', description: `${filename} has been downloaded successfully.` });
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: error instanceof Error ? error.message : 'Failed to download backup',
        variant: 'destructive',
      });
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
    if (!dateString) return 'Never';
    const date = new Date(dateString);
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
            <DialogTitle>Access Denied</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">You don't have permission to access this feature.</p>
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
            Backup & Recovery
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
                      <CardTitle className="text-lg text-purple-900">Automatic Backup Schedule</CardTitle>
                      <CardDescription className="text-purple-700">
                        Backups run daily at 2:00 AM
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-backup-dialog"
                      checked={settings?.enableAutoBackup ?? false}
                      onCheckedChange={(checked) => toggleAutoBackupMutation.mutate(checked)}
                      disabled={toggleAutoBackupMutation.isPending || !settings}
                      data-testid="dialog-auto-backup-toggle"
                    />
                    <Label htmlFor="auto-backup-dialog" className="cursor-pointer font-medium text-purple-900">
                      {settings?.enableAutoBackup ? 'Enabled' : 'Disabled'}
                    </Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100">
                    <Clock className="h-4 w-4 text-purple-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-600">Schedule</p>
                      <p className="font-semibold text-sm text-gray-900">Daily at 2:00 AM</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-600">Last Backup</p>
                      <p className="font-semibold text-sm text-gray-900">
                        {status?.lastSuccess ? formatDate(status.lastSuccess) : 'Never'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100">
                    <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-600">Next Backup</p>
                      <p className="font-semibold text-sm text-gray-900">
                        {settings?.enableAutoBackup ? 'Tonight at 2:00 AM' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </div>
                {status?.lastError && (
                  <div className="mt-3 flex items-start gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-900">Last backup error:</p>
                      <p className="text-xs text-red-700">{status.lastError}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Automated Backups */}
            {(recentDatabaseBackups.length > 0 || recentFilesBackups.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Recent Automated Backups</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                        <Database className="h-4 w-4 mr-2 text-blue-600" />
                        Database Backups
                      </h3>
                      {recentDatabaseBackups.length === 0 ? (
                        <p className="text-sm text-gray-500">No automated database backups yet</p>
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadAutomatedBackup(backup.filename)}
                                data-testid={`dialog-download-auto-db-${index}`}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-orange-600" />
                        Files Backups
                      </h3>
                      {recentFilesBackups.length === 0 ? (
                        <p className="text-sm text-gray-500">No automated files backups yet</p>
                      ) : (
                        <div className="space-y-2">
                          {recentFilesBackups.map((backup, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{backup.filename}</p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(backup.timestamp)} • {formatFileSize(backup.size)}
                                  {backup.metadata?.fileCount && ` • ${backup.metadata.fileCount} files`}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadAutomatedBackup(backup.filename)}
                                data-testid={`dialog-download-auto-files-${index}`}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download
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
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Manual Backup & Restore</h2>
              <div className="grid gap-4 md:grid-cols-3">
                {/* App Data */}
                <Card className="border hover:border-blue-300 transition-colors">
                  <CardHeader className="text-center pb-2">
                    <div className="flex justify-center mb-2">
                      <div className="p-3 bg-blue-100 rounded-full">
                        <Database className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                    <CardTitle className="text-base">App Data</CardTitle>
                    <CardDescription className="text-xs">All your business data</CardDescription>
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
                      {downloadingData ? 'Downloading...' : 'Download'}
                    </Button>

                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
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
                              {restoringData ? 'Restoring...' : 'Restore'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">Warning: Data Restore</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will replace ALL your current data with the backup file. This action cannot be undone. Your session will be reset and you'll need to log in again.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={handleRestoreData}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Yes, Restore Data
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
                    <CardTitle className="text-base">Uploaded Files</CardTitle>
                    <CardDescription className="text-xs">Documents & contracts</CardDescription>
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
                      {downloadingFiles ? 'Downloading...' : 'Download'}
                    </Button>

                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
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
                              {restoringFiles ? 'Restoring...' : 'Restore'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">Warning: Files Restore</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will replace ALL your uploaded files with the backup archive. Your database and code will NOT be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={handleRestoreFiles}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Yes, Restore Files
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
                    <CardTitle className="text-base">App Code</CardTitle>
                    <CardDescription className="text-xs">Source code files</CardDescription>
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
                      {downloadingCode ? 'Downloading...' : 'Download'}
                    </Button>

                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
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
                              {restoringCode ? 'Restoring...' : 'Restore'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">Warning: Code Restore</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will replace ALL your application source code. The application will restart automatically. Your database and uploaded files will NOT be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={handleRestoreCode}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Yes, Restore Code
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
                <CardTitle className="text-base text-blue-900">Recovery Instructions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-800 space-y-2">
                <p><strong>Data Recovery:</strong> Import the SQL file into PostgreSQL, restart the app, and log in.</p>
                <p><strong>Code Recovery:</strong> Extract the archive, run "npm install", configure the database, and run "npm run dev".</p>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
