import { useState, useRef } from "react";
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
import { Database, Code, Download, CheckCircle2, Clock, Calendar, AlertCircle, Upload, RotateCcw, FileText } from "lucide-react";
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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
  
  // Fetch backup settings
  const { data: settings } = useQuery<BackupSettings>({
    queryKey: ['/api/backup-settings'],
  });

  // Fetch backup status
  const { data: status } = useQuery<BackupStatus>({
    queryKey: ['/api/backups/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
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
  
  if (!user) {
    return <Redirect to="/auth" />;
  }
  
  if (user.role !== UserRole.ADMIN) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
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
        throw new Error('Failed to download data backup');
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
        title: 'Data Downloaded',
        description: 'Your app data has been downloaded successfully.',
      });
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
      const response = await fetch('/api/backups/download-code', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to download code backup');
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
        title: 'Code Downloaded',
        description: 'Your app code has been downloaded successfully.',
      });
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
        description: '⚠️ Your database has been restored. Please refresh your browser and log in again.',
        duration: 10000,
      });
      
      setSelectedDataFile(null);
      
      // Wait a moment then reload the page
      setTimeout(() => {
        window.location.reload();
      }, 3000);
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

  const handleDownloadFiles = async () => {
    setDownloadingFiles(true);
    try {
      const response = await fetch('/api/backups/download-files', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to download files backup');
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
        title: 'Files Downloaded',
        description: 'Your uploaded files have been downloaded successfully.',
      });
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
      const response = await fetch(`/api/backups/download/${filename}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to download backup');
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
        title: 'Backup Downloaded',
        description: `${filename} has been downloaded successfully.`,
      });
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Backup & Recovery</h1>
          <p className="text-gray-600 mt-2">
            Download backups of your app data and source code
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
                  <CardTitle className="text-lg text-purple-900">Automatic Backup Schedule</CardTitle>
                  <CardDescription className="text-purple-700">
                    Backups run daily at 2:00 AM to keep your data safe
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-backup"
                  checked={settings?.enableAutoBackup ?? false}
                  onCheckedChange={(checked) => toggleAutoBackupMutation.mutate(checked)}
                  disabled={toggleAutoBackupMutation.isPending || !settings}
                  data-testid="auto-backup-toggle"
                />
                <Label htmlFor="auto-backup" className="cursor-pointer font-medium text-purple-900">
                  {settings?.enableAutoBackup ? 'Enabled' : 'Disabled'}
                </Label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-100">
                <Clock className="h-5 w-5 text-purple-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600">Schedule</p>
                  <p className="font-semibold text-gray-900">Daily at 2:00 AM</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-100">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600">Last Backup</p>
                  <p className="font-semibold text-gray-900 text-sm">
                    {status?.lastSuccess ? formatDate(status.lastSuccess) : 'Never'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-100">
                <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600">Next Backup</p>
                  <p className="font-semibold text-gray-900 text-sm">
                    {settings?.enableAutoBackup ? 'Tonight at 2:00 AM' : 'Disabled'}
                  </p>
                </div>
              </div>
            </div>
            {status?.lastError && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-900">Last backup error:</p>
                  <p className="text-xs text-red-700">{status.lastError}</p>
                </div>
              </div>
            )}
            {settings?.enableAutoBackup && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-green-800">
                    <strong>Protection Active:</strong> Your data is automatically backed up every night, ensuring you always have a backup that's max 1 day old.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Automated Backups */}
        {(recentDatabaseBackups.length > 0 || recentFilesBackups.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Automated Backups</CardTitle>
              <CardDescription>Download backups created by the automatic backup system (saved to: ./backups/)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Database Backups */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <Database className="h-4 w-4 mr-2 text-blue-600" />
                    Database Backups (Last 3)
                  </h3>
                  {recentDatabaseBackups.length === 0 ? (
                    <p className="text-sm text-gray-500">No automated database backups yet</p>
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadAutomatedBackup(backup.filename)}
                            data-testid={`download-auto-db-${index}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Files Backups */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-orange-600" />
                    Files Backups (Last 3)
                  </h3>
                  {recentFilesBackups.length === 0 ? (
                    <p className="text-sm text-gray-500">No automated files backups yet</p>
                  ) : (
                    <div className="space-y-2">
                      {recentFilesBackups.map((backup, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
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
                            data-testid={`download-auto-files-${index}`}
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

        {/* Manual Download Buttons */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Manual Backup & Restore</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* App Data Backup */}
            <Card className="border-2 hover:border-blue-300 transition-colors">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-blue-100 rounded-full">
                    <Database className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <CardTitle className="text-xl">App Data</CardTitle>
                <CardDescription>
                  Download all your business data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>All vehicles, customers & reservations</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Expenses, documents & maintenance records</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>User accounts & settings</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Templates & notifications</span>
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
                  {downloadingData ? 'Downloading...' : 'Download App Data'}
                </Button>

                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore Data
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
                      <p className="text-xs text-gray-600">Selected: {selectedDataFile.name}</p>
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
                          {restoringData ? 'Restoring...' : 'Restore Data'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive">⚠️ Warning: Data Restore</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              <p>This will replace ALL your current data with the backup file. This action cannot be undone.</p>
                              <p className="mt-4"><strong>What will be replaced:</strong></p>
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>All vehicles, customers & reservations</li>
                                <li>All expenses & documents</li>
                                <li>All user accounts & settings</li>
                                <li>All templates & notifications</li>
                              </ul>
                              <p className="mt-4">Your session will be reset and you'll need to refresh and log in again.</p>
                            </div>
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

                <p className="text-xs text-gray-500 text-center">
                  Upload .sql file to restore
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
                <CardTitle className="text-xl">Uploaded Files</CardTitle>
                <CardDescription>
                  Download all documents & contracts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>All uploaded documents</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Driver licenses & contracts</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Expense receipts & photos</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>PDF template backgrounds</span>
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
                  {downloadingFiles ? 'Downloading...' : 'Download Uploaded Files'}
                </Button>

                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore Files
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
                      <p className="text-xs text-gray-600">Selected: {selectedFilesArchive.name}</p>
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
                          {restoringFiles ? 'Restoring...' : 'Restore Files'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive">⚠️ Warning: Files Restore</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              <p>This will replace ALL your uploaded files with the backup archive.</p>
                              <p className="mt-4"><strong>What will be replaced:</strong></p>
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>All uploaded documents</li>
                                <li>Driver licenses & contracts</li>
                                <li>Expense receipts & photos</li>
                                <li>PDF template backgrounds</li>
                              </ul>
                              <p className="mt-4"><strong>Note:</strong> Your database and code will NOT be affected. Only uploaded files will be restored.</p>
                            </div>
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

                <p className="text-xs text-gray-500 text-center">
                  Upload .tar.gz file to restore
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
                <CardTitle className="text-xl">App Code</CardTitle>
                <CardDescription>
                  Download all your source code files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Complete source code</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Configuration files</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Package dependencies list</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>Ready to restore & run</span>
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
                  {downloadingCode ? 'Downloading...' : 'Download App Code'}
                </Button>

                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore Code
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
                      <p className="text-xs text-gray-600">Selected: {selectedCodeFile.name}</p>
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
                          {restoringCode ? 'Restoring...' : 'Restore Code'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive">⚠️ Warning: Code Restore</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              <p>This will replace ALL your application source code with the backup archive. The application will restart automatically.</p>
                              <p className="mt-4"><strong>What will be replaced:</strong></p>
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>All source code files</li>
                                <li>Configuration files</li>
                                <li>Package dependencies</li>
                              </ul>
                              <p className="mt-4"><strong>Note:</strong> Your database and uploaded files will NOT be affected. Only code files will be restored.</p>
                            </div>
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

                <p className="text-xs text-gray-500 text-center">
                  Upload .tar.gz file to restore
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Info Section */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900">Recovery Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 space-y-2">
            <p><strong>To recover your app data:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Import the SQL file into your PostgreSQL database</li>
              <li>Restart your application</li>
              <li>Login with your admin account</li>
            </ol>
            
            <p className="mt-4"><strong>To recover your app code:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Extract the .tar.gz archive</li>
              <li>Run "npm install" to install dependencies</li>
              <li>Configure your database connection</li>
              <li>Run "npm run dev" to start the application</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
