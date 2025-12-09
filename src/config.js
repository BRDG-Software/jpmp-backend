import dotenv from 'dotenv';

dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',

  http: {
    host: process.env.HTTP_HOST || '0.0.0.0',
    port: parseInt(process.env.HTTP_PORT || '3000', 10)
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'brdg_jpmp',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10)
  }
};

// Validate required config
const required = [
  'db.user',
  'db.password'
];

for (const path of required) {
  const value = path.split('.').reduce((obj, key) => obj?.[key], config);
  if (!value) {
    throw new Error(`Missing required config: ${path}`);
  }
}

export default config;
