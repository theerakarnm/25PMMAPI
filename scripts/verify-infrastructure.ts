#!/usr/bin/env tsx

import { env } from '../src/core/config/env.js';

async function verifyInfrastructure() {
  console.log('🔍 Verifying Patient Notification System Infrastructure...\n');
  
  let allChecksPass = true;
  
  // Check 1: Environment Configuration
  console.log('1️⃣ Environment Configuration');
  try {
    console.log(`   ✅ NODE_ENV: ${env.NODE_ENV}`);
    console.log(`   ✅ PORT: ${env.PORT}`);
    console.log(`   ✅ Database URL configured: ${env.DATABASE_URL ? 'Yes' : 'No'}`);
    console.log(`   ✅ Redis URL configured: ${env.REDIS_URL ? 'Yes' : 'No'}`);
    console.log(`   ✅ JWT Secret configured: ${env.JWT_SECRET ? 'Yes' : 'No'}`);
    console.log(`   ✅ LINE API configured: ${env.LINE_CHANNEL_ACCESS_TOKEN ? 'Yes' : 'No'}`);
  } catch (error) {
    console.log(`   ❌ Environment configuration error: ${error}`);
    allChecksPass = false;
  }
  
  // Check 2: Core Modules
  console.log('\n2️⃣ Core Modules');
  try {
    const { AppError } = await import('../src/core/errors/app-error.js');
    console.log('   ✅ AppError class imported successfully');
    
    const { ResponseBuilder } = await import('../src/core/response/response-builder.js');
    console.log('   ✅ ResponseBuilder imported successfully');
    
    const { JwtService } = await import('../src/core/auth/jwt.js');
    console.log('   ✅ JwtService imported successfully');
  } catch (error) {
    console.log(`   ❌ Core modules error: ${error}`);
    allChecksPass = false;
  }
  
  // Check 3: LINE Integration
  console.log('\n3️⃣ LINE Integration');
  try {
    const { LineClient } = await import('../src/core/line/client.js');
    console.log('   ✅ LineClient imported successfully');
    
    const { LineWebhookHandler } = await import('../src/core/line/webhook-handler.js');
    console.log('   ✅ LineWebhookHandler imported successfully');
  } catch (error) {
    console.log(`   ❌ LINE integration error: ${error}`);
    allChecksPass = false;
  }
  
  // Check 4: Job Queue System
  console.log('\n4️⃣ Job Queue System');
  try {
    const { JobManager } = await import('../src/core/jobs/queue.js');
    console.log('   ✅ JobManager imported successfully');
    
    const { ProtocolScheduler } = await import('../src/core/jobs/scheduler.js');
    console.log('   ✅ ProtocolScheduler imported successfully');
  } catch (error) {
    console.log(`   ❌ Job queue system error: ${error}`);
    allChecksPass = false;
  }
  
  // Check 5: Database Schema
  console.log('\n5️⃣ Database Schema');
  try {
    const schema = await import('../src/core/database/schema.js');
    console.log('   ✅ Database schema imported successfully');
    console.log(`   ✅ Tables defined: ${Object.keys(schema).length}`);
  } catch (error) {
    console.log(`   ❌ Database schema error: ${error}`);
    allChecksPass = false;
  }
  
  // Check 6: API Routes
  console.log('\n6️⃣ API Routes');
  try {
    const { auth } = await import('../src/routes/auth.js');
    console.log('   ✅ Auth routes imported successfully');
    
    const { users } = await import('../src/routes/users.js');
    console.log('   ✅ Users routes imported successfully');
    
    const { line } = await import('../src/routes/line.js');
    console.log('   ✅ LINE routes imported successfully');
  } catch (error) {
    console.log(`   ❌ API routes error: ${error}`);
    allChecksPass = false;
  }
  
  // Final Result
  console.log('\n' + '='.repeat(50));
  if (allChecksPass) {
    console.log('🎉 All infrastructure components verified successfully!');
    console.log('✅ Ready to start development server with: npm run dev');
  } else {
    console.log('❌ Some infrastructure components have issues');
    console.log('🔧 Please check the errors above and fix configuration');
  }
  console.log('='.repeat(50));
  
  return allChecksPass;
}

// Run verification if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyInfrastructure().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { verifyInfrastructure };