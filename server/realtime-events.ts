import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

// Function to set the Socket.IO server instance
export function setSocketInstance(socketInstance: SocketIOServer) {
  io = socketInstance;
}

/**
 * BUG-005: this used to emit the whole record — license plate, chassis number,
 * customer, cost lines — to every connected socket, and the socket accepted
 * connections without a cookie. Connections are authenticated in
 * setupSocketIO() now; the payload is cut down to what the client actually
 * reads, which is the id it needs to invalidate a query.
 *
 * Deviation from the plan's literal `{entityType, action, id}`: use-socket.tsx
 * also reads `data.vehicleId` (reservations, expenses, documents) to invalidate
 * the vehicle's queries, and the "portal" entityType carries a toast title and
 * description that are not a database record at all. Both are preserved; every
 * other field of every record is dropped.
 */
function reducePayload(entityType: string, data: any): any {
  if (data === undefined || data === null) return undefined;
  if (entityType === 'portal') return data;
  if (typeof data !== 'object') return undefined;
  const reduced: Record<string, unknown> = {};
  if (data.id !== undefined) reduced.id = data.id;
  if (data.vehicleId !== undefined) reduced.vehicleId = data.vehicleId;
  return reduced;
}

// Broadcast functions for real-time updates
export function broadcastDataUpdate(entityType: string, action: string, data?: any) {
  if (!io) return;

  console.log(`📡 Broadcasting: ${entityType} ${action}`);

  // Broadcast to all connected (authenticated) clients
  io.emit('data-update', {
    entityType,
    action, // 'created', 'updated', 'deleted'
    data: reducePayload(entityType, data),
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