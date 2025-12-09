import postgres from 'postgres';
import config from '../config.js';

const dbConfig = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  username: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl,
  max: config.db.maxConnections,
  idle_timeout: 30,
  connect_timeout: 10
};

// Create initial postgres connection pool
let sql = postgres(dbConfig);

// Track connection state
let isConnected = true;

export async function disconnectDatabase() {
  if (isConnected) {
    console.log('Disconnecting from database...');
    await sql.end({ timeout: 5 });
    isConnected = false;
    console.log('Database disconnected');
  }
}

export async function reconnectDatabase() {
  if (!isConnected) {
    console.log('Reconnecting to database...');
    sql = postgres(dbConfig);
    isConnected = true;
    console.log('Database reconnected');
  }
}

export function getConnection() {
  if (!isConnected) {
    throw new Error('Database is disconnected for maintenance');
  }
  return sql;
}

// Helper function to initialize the database
export async function initDatabase() {
  try {
    // Read the schema file
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    // Execute the schema
    await getConnection().unsafe(schema);
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

export default sql;
