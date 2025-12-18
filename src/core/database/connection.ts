import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

const database = drizzle(env.DATABASE_URL);

export { database }