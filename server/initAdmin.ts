import { storage } from './storage';
import { hashPassword } from './auth';
import { UserRole } from '../shared/schema';

/**
 * Initialize default admin user if no admin users exist
 * This runs on application startup to ensure there's always an admin user available
 */
export async function initializeDefaultAdmin(): Promise<void> {
  try {
    // Check if any admin users already exist
    const allUsers = await storage.getAllUsers();
    const adminUsers = allUsers.filter(user => user.role === UserRole.ADMIN && user.active);
    
    if (adminUsers.length > 0) {
      console.log(`✅ Found ${adminUsers.length} existing admin user(s). Skipping admin initialization.`);
      return;
    }
    
    // Get admin credentials from environment variables
    const defaultAdminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@carrentals.local';
    const defaultAdminName = process.env.DEFAULT_ADMIN_NAME || 'System Administrator';
    
    // Check if a user with this username already exists
    const existingUser = await storage.getUserByUsername(defaultAdminUsername);
    if (existingUser) {
      console.log(`⚠️  User '${defaultAdminUsername}' already exists but is not admin. Skipping admin creation.`);
      return;
    }
    
    // Create default admin user
    const hashedPassword = await hashPassword(defaultAdminPassword);
    
    const adminUser = await storage.createUser({
      username: defaultAdminUsername,
      password: hashedPassword,
      fullName: defaultAdminName,
      email: defaultAdminEmail,
      role: UserRole.ADMIN,
      permissions: [
        'manage_users',
        'manage_vehicles', 
        'manage_customers',
        'manage_reservations',
        'manage_expenses',
        'manage_documents',
        'view_dashboard'
      ],
      active: true,
      createdBy: 'system',
      updatedBy: 'system'
    });
    
    console.log(`✅ Created default admin user:`);
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Role: ${adminUser.role}`);
    
    // Security reminder for production
    if (process.env.NODE_ENV === 'production') {
      console.log(`🔒 SECURITY REMINDER: Please change the default admin password after first login!`);
      console.log(`   Set custom credentials using environment variables:`);
      console.log(`   - DEFAULT_ADMIN_USERNAME`);
      console.log(`   - DEFAULT_ADMIN_PASSWORD`);
      console.log(`   - DEFAULT_ADMIN_EMAIL`);
      console.log(`   - DEFAULT_ADMIN_NAME`);
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize default admin user:', error);
    // Don't throw the error - app should still start even if admin creation fails
    console.log('   Application will continue startup. You can create admin users manually.');
  }
}

/**
 * Display deployment information and admin setup instructions
 */
export function displayDeploymentInfo(): void {
  console.log('\n🚀 DEPLOYMENT SETUP INFORMATION');
  console.log('=======================================');
  
  if (process.env.NODE_ENV === 'production') {
    console.log('📋 For GitHub deployment, set these environment variables:');
    console.log('   DEFAULT_ADMIN_USERNAME (default: admin)');
    console.log('   DEFAULT_ADMIN_PASSWORD (default: admin123) ⚠️  CHANGE THIS!');
    console.log('   DEFAULT_ADMIN_EMAIL (default: admin@carrentals.local)');
    console.log('   DEFAULT_ADMIN_NAME (default: System Administrator)');
    console.log('');
    console.log('🔧 Example GitHub deployment environment:');
    console.log('   DEFAULT_ADMIN_USERNAME=your_admin');
    console.log('   DEFAULT_ADMIN_PASSWORD=your_secure_password');
    console.log('   DEFAULT_ADMIN_EMAIL=admin@yourcompany.com');
    console.log('   DEFAULT_ADMIN_NAME=Your Name');
  } else {
    console.log('🧪 Development mode - using default test admin credentials');
    console.log('   Username: admin');
    console.log('   Password: admin123');
  }
  
  console.log('=======================================\n');
}