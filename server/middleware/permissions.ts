import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../shared/schema.js';

// Check if user has specific permission(s) - supports multiple permissions (OR logic)
// NOTE: This middleware assumes authentication has already been verified upstream via requireAuth
export const hasPermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Trust that req.user exists if authentication middleware was applied upstream
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Admin role always has all permissions
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }
    
    const userPermissions = req.user.permissions || [];
    const hasRequiredPermission = permissions.some(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasRequiredPermission) {
      return res.status(403).json({ 
        message: `Not authorized. One of these permissions required: ${permissions.join(', ')}` 
      });
    }
    
    next();
  };
};

// Check for admin role
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ message: "Not authorized. Admin access required." });
  }
  
  next();
};
