import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

// Function to set the Socket.IO server instance
export function setSocketInstance(socketInstance: SocketIOServer) {
  io = socketInstance;
}

// Broadcast functions for real-time updates
export function broadcastDataUpdate(entityType: string, action: string, data?: any) {
  if (!io) return;
  
  console.log(`📡 Broadcasting: ${entityType} ${action}`);
  
  // Broadcast to all connected clients
  io.emit('data-update', {
    entityType,
    action, // 'created', 'updated', 'deleted'
    data,
    timestamp: new Date().toISOString()
  });
}

// Specific broadcast functions for different entities
export const realtimeEvents = {
  users: {
    created: (data: any) => broadcastDataUpdate('users', 'created', data),
    updated: (data: any) => broadcastDataUpdate('users', 'updated', data),
    deleted: (data: any) => broadcastDataUpdate('users', 'deleted', data),
  },
  vehicles: {
    created: (data: any) => broadcastDataUpdate('vehicles', 'created', data),
    updated: (data: any) => broadcastDataUpdate('vehicles', 'updated', data),
    deleted: (data: any) => broadcastDataUpdate('vehicles', 'deleted', data),
  },
  customers: {
    created: (data: any) => broadcastDataUpdate('customers', 'created', data),
    updated: (data: any) => broadcastDataUpdate('customers', 'updated', data),
    deleted: (data: any) => broadcastDataUpdate('customers', 'deleted', data),
  },
  reservations: {
    created: (data: any) => broadcastDataUpdate('reservations', 'created', data),
    updated: (data: any) => broadcastDataUpdate('reservations', 'updated', data),
    deleted: (data: any) => broadcastDataUpdate('reservations', 'deleted', data),
  },
  expenses: {
    created: (data: any) => broadcastDataUpdate('expenses', 'created', data),
    updated: (data: any) => broadcastDataUpdate('expenses', 'updated', data),
    deleted: (data: any) => broadcastDataUpdate('expenses', 'deleted', data),
  },
  documents: {
    created: (data: any) => broadcastDataUpdate('documents', 'created', data),
    updated: (data: any) => broadcastDataUpdate('documents', 'updated', data),
    deleted: (data: any) => broadcastDataUpdate('documents', 'deleted', data),
  },
  notifications: {
    created: (data: any) => broadcastDataUpdate('notifications', 'created', data),
    updated: (data: any) => broadcastDataUpdate('notifications', 'updated', data),
    deleted: (data: any) => broadcastDataUpdate('notifications', 'deleted', data),
  }
};