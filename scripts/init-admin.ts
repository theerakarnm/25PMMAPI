import { AuthRepository } from '../src/features/auth/repository.js';
import { env } from '../src/core/config/env.js';

async function initializeAdmin() {
  try {
    console.log('🔄 Connecting to database...');
    
    const authRepository = new AuthRepository();
    
    // Check if admin already exists
    const existingAdmin = await authRepository.findByEmail(env.ADMIN_EMAIL);
    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      return;
    }
    
    // Create admin user
    console.log('🔄 Creating admin user...');
    const admin = await authRepository.createAdmin({
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      name: 'System Administrator',
      role: 'admin',
    });
    
    console.log('✅ Admin user created successfully');
    console.log(`📧 Email: ${admin.email}`);
    console.log(`👤 Name: ${admin.name}`);
    console.log(`🔑 Role: ${admin.role}`);
    
  } catch (error) {
    console.error('❌ Failed to initialize admin:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

initializeAdmin();