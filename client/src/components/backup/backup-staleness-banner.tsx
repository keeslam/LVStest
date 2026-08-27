import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { UserRole, UserPermission } from '@shared/schema';

interface BackupHealth {
  lastSuccessAt: string | null;
  ageHours: number | null;
  stale: boolean;
  lastError: string | null;
}

/**
 * A backup system that fails silently is worse than none, because it is
 * trusted. This surfaces staleness where it will actually be seen.
 */
export function BackupStalenessBanner() {
  const { t } = useTranslation('settings');
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const userPermissions = (user?.permissions as string[]) || [];
  const canViewBackupHealth = isAdmin || userPermissions.includes(UserPermission.MANAGE_BACKUPS);

  const { data } = useQuery<BackupHealth>({
    queryKey: ['/api/backups/health'],
    enabled: canViewBackupHealth,
  });

  if (!data?.stale) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
      data-testid="banner-backup-stale"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
      <div className="text-sm">
        <p className="font-semibold">
          {data.lastSuccessAt
            ? t('backup.noVerifiedBackupHours', { hours: data.ageHours })
            : t('backup.noVerifiedBackupEver')}
        </p>
        <p className="mt-0.5">
          {data.lastError
            ? t('backup.lastError', { error: data.lastError })
            : t('backup.openBackupPrompt')}
        </p>
      </div>
    </div>
  );
}
