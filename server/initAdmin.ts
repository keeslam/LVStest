import { randomBytes } from 'crypto';
import { storage } from './storage';
import { hashPassword } from './auth';
import { UserRole } from '../shared/schema';

/**
 * BUG-062 — the first admin was created with the hard-coded password
 * `admin123` whenever DEFAULT_ADMIN_PASSWORD was unset, in production as much
 * as in development, and the deployment banner printed that password to the
 * container log. A deployment that has not been told what the admin password
 * should be does not get to invent one.
 *
 * Exported so the rule can be tested without starting a process.
 */
export function resolveDefaultAdminPassword(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DEFAULT_ADMIN_PASSWORD;
  if (configured && configured.trim().length > 0) return configured;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'DEFAULT_ADMIN_PASSWORD is not set. Refusing to create the first administrator with a ' +
      'built-in password in production. Set DEFAULT_ADMIN_PASSWORD in the deployment environment.',
    );
  }

  // Development only, and deliberately not a value anybody could guess or find
  // in this repository: it is printed once, here, and nowhere else.
  const generated = randomBytes(12).toString('base64url');
  console.log(
    '⚠️  DEFAULT_ADMIN_PASSWORD is not set. Generated a one-off development password for the ' +
    `first administrator: ${generated}`,
  );
  return generated;
}

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
    const defaultAdminPassword = resolveDefaultAdminPassword(process.env);
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
    console.log('   DEFAULT_ADMIN_PASSWORD (required in production - no built-in default)');
    console.log('   DEFAULT_ADMIN_EMAIL (default: admin@carrentals.local)');
    console.log('   DEFAULT_ADMIN_NAME (default: System Administrator)');
    console.log('');
    console.log('🔧 Example GitHub deployment environment:');
    console.log('   DEFAULT_ADMIN_USERNAME=your_admin');
    console.log('   DEFAULT_ADMIN_PASSWORD=your_secure_password');
    console.log('   DEFAULT_ADMIN_EMAIL=admin@yourcompany.com');
    console.log('   DEFAULT_ADMIN_NAME=Your Name');
  } else {
    console.log('🧪 Development mode');
    console.log('   Username: admin (DEFAULT_ADMIN_USERNAME)');
    console.log('   Password: from DEFAULT_ADMIN_PASSWORD, or generated once and printed above');
  }
  
  console.log('=======================================\n');
}