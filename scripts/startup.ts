#!/usr/bin/env tsx

import { runMigrations } from './migrate.js';
import { env } from '../src/core/config/env.js';

async function startup() {
  console.log('🚀 Starting Patient Notification System API...');
  console.log(`📊 Environment: ${env.NODE_ENV}`);
  console.log(`🔌 Port: ${env.PORT}`);
  
  try {
    // Run database migrations
    console.log('🔄 Running database migrations...');
    await runMigrations();
    
    console.log('✅ Startup completed successfully!');
    console.log('🎯 Ready to start the server with: npm run dev');
    
  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

// Run startup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startup();
}

export { startup };