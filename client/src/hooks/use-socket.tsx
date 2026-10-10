import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
// The app's i18n instance, the way format-utils.ts uses it: this hook lives
// outside any component that could carry a useTranslation().
import i18n from '@/i18n';
import { 
  invalidateVehicleData, 
  invalidateReservationData,
  invalidateCustomerData,
  invalidateExpenseData,
  invalidateDocumentData,
  invalidateNotificationData
} from '@/lib/cache-utils';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false
});

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  // The handshake is checked against the session (BUG-005), so a socket opened
  // before sign-in is refused ("Socket connection error: unauthorized", A-1-7).
  // Connect only once a user is loaded; a sign-out closes it again and the next
  // sign-in opens a fresh one that carries the new session.
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (userId === undefined) return;

    // Create socket connection
    // Polling first, then upgrade to websocket. Reverse order fails hard behind
    // proxies that don't pass the WS upgrade through (e.g. Traefik in Coolify)
    // instead of quietly falling back.
    const socketInstance = io({
      transports: ['polling', 'websocket'],
      timeout: 20000,
    });

    setSocket(socketInstance);

    // Connection event handlers
    socketInstance.on('connect', () => {
      console.log('🔗 Connected to real-time server:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from real-time server:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connected', (data) => {
      console.log('✅ Real-time connection established:', data.message);
    });

    // Real-time data update handler
    socketInstance.on('data-update', (event) => {
      console.log('📡 Received real-time update:', event);
      
      const { entityType, action, data } = event;

      // A customer did something in the portal: show it right away, and let
      // the Klantenportaal badge and lists refresh.
      if (entityType === 'portal') {
        toast({ title: data?.title ?? 'Klantenportaal', description: data?.description });
        queryClient.invalidateQueries({ queryKey: ['/api/portal-admin/unread-count'] });
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/portal-admin') });
        queryClient.invalidateQueries({ queryKey: ['/api/custom-notifications/unread'] });
        return;
      }

      // An invoice arrived by e-mail (server/services/invoice-inbox/notify.ts).
      // I5: the payload carries no title any more — anyone can mail that address,
      // so a stranger's subject line must not become a toast in every session.
      // One translated sentence; what it says is in the list and in the bell.
      if (entityType === 'invoice-inbox') {
        toast({ title: i18n.t('expenses:invoiceInbox.toastTitle') });
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/expenses') });
        queryClient.invalidateQueries({ queryKey: ['/api/custom-notifications/unread'] });
        return;
      }

      // A-18-4: an administrator changed THIS account (rights, role, active). The
      // server enforces it from the next request on; refetch the cached
      // /api/user so greyed buttons and the sidebar follow at once.
      if (entityType === 'users' && action === 'updated' && userId !== undefined && data?.id === userId) {
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      }

      // Invalidate React Query cache for real-time updates
      // This will automatically refetch active queries and update the UI
      invalidateQueries(entityType, action, data);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      setIsConnected(false);
    });

    return () => {
      console.log('🔌 Cleaning up socket connection...');
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [toast, userId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * Smart cache invalidation based on entity type and action.
 * Uses soft invalidation (refetchType: 'none') to prevent dialogs from closing.
 * Data will be refetched when components re-render or when they actively need it.
 */
function invalidateQueries(entityType: string, action: string, data?: any) {
  console.log(`🔄 Soft-invalidating cache for ${entityType} ${action}`, data);

  switch (entityType) {
    case 'users':
      queryClient.invalidateQueries({ 
        queryKey: ['/api/users'],
        refetchType: 'none'
      });
      if (data?.id) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/users', data.id],
          refetchType: 'none'
        });
      }
      break;

    case 'vehicles':
      invalidateVehicleData(data?.id);
      break;

    case 'customers':
      invalidateCustomerData(data?.id);
      break;

    case 'reservations':
      invalidateReservationData(data?.id, data?.vehicleId);
      break;

    case 'expenses':
      invalidateExpenseData(data?.id, data?.vehicleId);
      break;

    case 'documents':
      invalidateDocumentData(data?.id, data?.vehicleId);
      break;

    case 'notifications':
      invalidateNotificationData(data?.id);
      break;

    default:
      console.log('🔄 Unknown entity type, soft-invalidating related queries:', entityType);
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/');
        },
        refetchType: 'none'
      });
      break;
  }
}