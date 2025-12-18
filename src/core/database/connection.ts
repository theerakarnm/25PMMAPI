import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

// Create PostgreSQL client
const client = new Client({
  connectionString: env.DATABASE_URL,
});

// Connect to database
await client.connect();

// Create drizzle instance with schema
const database = drizzle(client, { schema });

export { database, client };