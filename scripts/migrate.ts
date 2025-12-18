import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../src/core/config/env.js';
import { Client } from 'pg';

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  
  try {
    // Create database connection
    const client = new Client({
      connectionString: env.DATABASE_URL,
    });
    
    await client.connect();
    console.log('✅ Connected to database');
    
    // Create drizzle instance
    const db = drizzle(client);
    
    // Run migrations
    await migrate(db, { migrationsFolder: './drizzle' });
    
    console.log('✅ Migrations completed successfully');
    
    await client.end();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

export { runMigrations };