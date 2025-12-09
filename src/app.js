import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import config from './config.js';
import { getConnection, initDatabase } from './lib/db.js';

// Import routes
import itemRoutes from './routes/items.js';
import orderRoutes from './routes/orders.js';
import kioskRoutes from './routes/kiosks.js';
import maintenanceRoutes from './routes/maintenance.js';
import { maintenanceMiddleware } from './middleware/maintenance.js';

// Create Koa app
const app = new Koa();
const router = new Router();

// Set up middleware
app.use(cors());
app.use(bodyParser());
app.use(maintenanceMiddleware);

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      error: {
        message: err.message,
        status: ctx.status
      }
    };
    ctx.app.emit('error', err, ctx);
  }
});

// Set up routes
router.get('/', (ctx) => {
  ctx.body = {
    message: 'BRDG JPMP API',
    version: process.env.API_VERSION || '0.0.0',
    env: config.env
  };
});

// Mount route modules
router.use('/maintenance', maintenanceRoutes.routes(), maintenanceRoutes.allowedMethods());
router.use('/items', itemRoutes.routes(), itemRoutes.allowedMethods());
router.use('/orders', orderRoutes.routes(), orderRoutes.allowedMethods());
router.use('/kiosks', kioskRoutes.routes(), kioskRoutes.allowedMethods());

// Apply router middleware
app.use(router.routes());
app.use(router.allowedMethods());

// Start server
const startServer = async () => {
  try {
    // Check if --init-database flag is passed
    const shouldInitDatabase = process.argv.includes('--init-database');

    if (shouldInitDatabase) {
      console.log('Initializing database schema...');
      await initDatabase();
      console.log('Database schema initialized successfully');
    }

    // Start HTTP server
    const server = app.listen(config.http.port, config.http.host, () => {
      console.log(`Server running on http://${config.http.host}:${config.http.port}`);
    });

    // Graceful shutdown function
    const gracefulShutdown = async (signal) => {
      console.log(`${signal} received. Shutting down gracefully...`);

      // Close the HTTP server
      server.close(() => {
        console.log('HTTP server closed');
      });

      // Close database connections
      try {
        console.log('Closing database connections...');
        await getConnection().end();
        console.log('Database connections closed');
      } catch (err) {
        console.error('Error closing database connections:', err);
      }

      // Exit with success code
      process.exit(0);
    };

    // Process hooks for graceful shutdown
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
