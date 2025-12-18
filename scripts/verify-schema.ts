import { database } from '../src/core/database/connection.js';
import { users, admins, protocols, protocolSteps, protocolAssignments, interactionLogs } from '../src/core/database/schema.js';

async function verifySchema() {
  try {
    console.log('🔍 Verifying database schema...');
    
    // Test each table by running a simple query
    const tables = [
      { name: 'users', table: users },
      { name: 'admins', table: admins },
      { name: 'protocols', table: protocols },
      { name: 'protocol_steps', table: protocolSteps },
      { name: 'protocol_assignments', table: protocolAssignments },
      { name: 'interaction_logs', table: interactionLogs },
    ];
    
    for (const { name, table } of tables) {
      try {
        await database.select().from(table).limit(0);
        console.log(`✅ ${name} table is accessible`);
      } catch (error) {
        console.error(`❌ ${name} table error:`, error);
      }
    }
    
    console.log('✅ Schema verification completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Schema verification failed:', error);
    process.exit(1);
  }
}

verifySchema();