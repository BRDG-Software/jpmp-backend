import Router from 'koa-router';
import { getMaintenanceMode, setMaintenanceMode } from '../middleware/maintenance.js';

const router = new Router();

router.get('/', (ctx) => {
  ctx.body = { enabled: getMaintenanceMode() };
});

router.post('/', (ctx) => {
  const { enabled } = ctx.request.body;

  if (typeof enabled !== 'boolean') {
    ctx.status = 400;
    ctx.body = {
      error: {
        message: 'enabled must be a boolean',
        status: 400
      }
    };
    return;
  }

  setMaintenanceMode(enabled);
  ctx.body = { enabled: getMaintenanceMode() };
});

export default router;
