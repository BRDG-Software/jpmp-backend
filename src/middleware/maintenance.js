import { disconnectDatabase, reconnectDatabase } from '../lib/db.js';

let maintenanceMode = false;

function isMaintenanceEndpoint(path) {
  return path === '/maintenance' || path === '/maintenance/';
}

export const getMaintenanceMode = () => maintenanceMode;

export const setMaintenanceMode = async (enabled) => {
  if (enabled === maintenanceMode) {
    return maintenanceMode;
  }

  if (enabled) {
    await disconnectDatabase();
  } else {
    await reconnectDatabase();
  }

  maintenanceMode = enabled;
  return maintenanceMode;
};

export const maintenanceMiddleware = async (ctx, next) => {
  // Always allow maintenance endpoint
  if (isMaintenanceEndpoint(ctx.path)) {
    return await next();
  }

  // Return 503 for all other endpoints when in maintenance mode
  if (maintenanceMode) {
    ctx.status = 503;
    ctx.body = {
      error: {
        message: 'Service temporarily unavailable due to maintenance. Database is disconnected.',
        status: 503
      }
    };
    return;
  }

  try {
    await next();
  } catch (err) {
    if (err.message === 'Database is disconnected for maintenance') {
      ctx.status = 503;
      ctx.body = {
        error: {
          message: 'Service temporarily unavailable due to maintenance. Database is disconnected.',
          status: 503
        }
      };
      return;
    }
    throw err;
  }
};
