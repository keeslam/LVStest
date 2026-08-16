import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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

  useEffect(() => {
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
    };
  }, [toast]);

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