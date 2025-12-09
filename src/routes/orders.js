import Router from 'koa-router';
import { getConnection } from '../lib/db.js';

const router = new Router();

const getSql = () => getConnection();

/**
 * Get all orders
 * GET /api/orders
 * Query params:
 *   - latest: optional integer to limit the number of results
 *   - user: optional user ID to filter orders by user_profile->>'id'
 *   - kiosk_type: optional kiosk type to filter orders by kiosk_type
 */
router.get('/', async (ctx) => {
  const latest = ctx.query.latest;
  const userId = ctx.query.user;
  const kioskType = ctx.query.kiosk_type;

  // Validate latest parameter if provided
  if (latest !== undefined) {
    const latestNum = parseInt(latest, 10);
    if (isNaN(latestNum) || latestNum < 1) {
      ctx.status = 400;
      ctx.body = { error: { message: 'latest parameter must be a positive integer' } };
      return;
    }
  }

  // Validate kiosk_type parameter if provided
  if (kioskType !== undefined && !['sweet', 'juice'].includes(kioskType)) {
    ctx.status = 400;
    ctx.body = { error: { message: 'kiosk_type must be either "sweet" or "juice"' } };
    return;
  }

  // Build query with optional filters
  let orders;

  // Build WHERE conditions
  const conditions = [];
  if (userId !== undefined) {
    conditions.push(`o.user_profile->>'id' = '${userId}'`);
  }
  if (kioskType !== undefined) {
    conditions.push(`o.kiosk_type = '${kioskType}'::kiosk_type`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = latest !== undefined ? `LIMIT ${parseInt(latest, 10)}` : '';

  orders = await getSql().unsafe(`
    SELECT o.*
    FROM orders o
    ${whereClause}
    ORDER BY o.created_at DESC
    ${limitClause}
  `);

  // Get order items for each order
  for (const order of orders) {
    order.items = await getSql()`
      SELECT oi.*, i.slug, i.name, i.description, i.available
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      WHERE oi.order_id = ${order.id}
    `;
  }

  ctx.body = { orders };
});

/**
 * Get orders by status
 * GET /api/orders/status/:status
 * Query params:
 *   - latest: optional integer to limit the number of results
 */
router.get('/status/:status', async (ctx) => {
  const status = ctx.params.status;
  const latest = ctx.query.latest;

  // Validate status
  if (!['pending', 'completed', 'canceled'].includes(status)) {
    ctx.status = 400;
    ctx.body = { error: { message: 'Invalid order status' } };
    return;
  }

  // Validate latest parameter if provided
  if (latest !== undefined) {
    const latestNum = parseInt(latest, 10);
    if (isNaN(latestNum) || latestNum < 1) {
      ctx.status = 400;
      ctx.body = { error: { message: 'latest parameter must be a positive integer' } };
      return;
    }
  }

  let orders;
  if (latest !== undefined) {
    const limit = parseInt(latest, 10);
    orders = await getSql()`
      SELECT o.*
      FROM orders o
      WHERE o.status = ${status}::order_status
      ORDER BY o.created_at DESC
      LIMIT ${limit}
    `;
  } else {
    orders = await getSql()`
      SELECT o.*
      FROM orders o
      WHERE o.status = ${status}::order_status
      ORDER BY o.created_at DESC
    `;
  }

  // Get order items for each order
  for (const order of orders) {
    order.items = await getSql()`
      SELECT oi.*, i.name, i.description
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      WHERE oi.order_id = ${order.id}
    `;
  }

  ctx.body = { orders };
});

/**
 * Get a specific order
 * GET /api/orders/:id
 */
router.get('/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.status = 400;
    ctx.body = { error: { message: 'Invalid order ID' } };
    return;
  }

  const [order] = await getSql()`
    SELECT o.*
    FROM orders o
    WHERE o.id = ${id}
  `;

  if (!order) {
    ctx.status = 404;
    ctx.body = { error: { message: 'Order not found' } };
    return;
  }

  // Get order items
  order.items = await getSql()`
    SELECT oi.*, i.name, i.description
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    WHERE oi.order_id = ${order.id}
  `;

  ctx.body = { order };
});

/**
 * Create a new order
 * POST /api/orders
 */
router.post('/', async (ctx) => {
  const { kiosk_id, items, user_profile, status } = ctx.request.body;

  // Validate required fields
  if (!kiosk_id || !items || !Array.isArray(items) || items.length === 0) {
    ctx.status = 400;
    ctx.body = { error: { message: 'kiosk_id and items array are required' } };
    return;
  }

  // Validate optional status field - only allow undefined or 'completed'
  if (status !== undefined && status !== 'completed') {
    ctx.status = 400;
    ctx.body = { error: { message: 'Status can only be undefined or "completed"' } };
    return;
  }

  // Validate items structure
  for (const item of items) {
    if (!item.id) {
      ctx.status = 400;
      ctx.body = { error: { message: 'Each item must have an id' } };
      return;
    }
  }

  // Validate kiosk exists
  const [kiosk] = await getSql()`
    SELECT * FROM kiosks
    WHERE id = ${kiosk_id}
  `;

  if (!kiosk) {
    ctx.status = 400;
    ctx.body = { error: { message: 'Invalid kiosk ID' } };
    return;
  }

  // Check for duplicate order from same kiosk and user within 30 seconds
  const [recentOrder] = await getSql()`
    SELECT o.*
    FROM orders o
    WHERE o.kiosk_id = ${kiosk_id}
    ORDER BY o.id DESC
    LIMIT 1
  `;

  // If a recent order exists, check if it's a duplicate
  if (recentOrder) {
    const orderAge = Date.now() - new Date(recentOrder.created_at).getTime();
    const isWithin30Seconds = orderAge <= 30000;

    // Check if user profiles match (both null or both have same id)
    const requestUserId = user_profile?.id;
    const existingUserId = recentOrder.user_profile?.id;
    const sameUser = requestUserId === existingUserId;

    if (isWithin30Seconds && sameUser) {
      // Fetch the order items
      recentOrder.items = await getSql()`
        SELECT oi.*, i.name, i.description
        FROM order_items oi
        JOIN items i ON oi.item_id = i.id
        WHERE oi.order_id = ${recentOrder.id}
      `;

      ctx.status = 201;
      ctx.body = { order: recentOrder };
      return;
    }
  }

  // Validate items exist and are available
  for (const item of items) {
    let dbItem;
    if (typeof item.id === 'string') {
      // Look up by slug
      [dbItem] = await getSql()`
        SELECT * FROM items
        WHERE slug = ${item.id}
      `;
    } else {
      // Look up by ID
      [dbItem] = await getSql()`
        SELECT * FROM items
        WHERE id = ${item.id}
      `;
    }

    if (!dbItem) {
      ctx.status = 404;
      ctx.body = { error: { message: `Item ${item.id} not found` } };
      return;
    }

    if (!dbItem.available) {
      ctx.status = 410;
      ctx.body = { error: { message: `Item ${item.id} is out of stock` } };
      return;
    }

    // Validate item belongs to the kiosk type
    // if (dbItem.kiosk_type !== kiosk.type) {
    //   ctx.status = 400;
    //   ctx.body = { error: { message: `Item ${item.id} does not belong to kiosk type ${kiosk.type}` } };
    //   return;
    // }

    // Store the actual item ID for order_items creation
    item.dbId = dbItem.id;
  }

  // Create order
  let order;

  // Use a transaction to ensure all operations succeed or fail together
  await getSql().begin(async (sql) => {
    // Create order with explicit null handling
    const orderStatus = status || 'pending';
    const [newOrder] = await sql`
      INSERT INTO orders (
        kiosk_id, kiosk_type, status, user_profile
      ) VALUES (
        ${kiosk_id},
        ${kiosk.type}::kiosk_type,
        ${orderStatus}::order_status,
        ${user_profile === undefined ? null : user_profile}
      )
      RETURNING *
    `;

    // Add order items with explicit null handling
    for (const item of items) {
      await sql`
        INSERT INTO order_items (
          order_id, item_id, customizations
        ) VALUES (
          ${newOrder.id},
          ${item.dbId},
          ${item.customizations === undefined ? null : item.customizations}
        )
      `;
    }

    // Get complete order with items
    const [completeOrder] = await sql`
      SELECT o.*
      FROM orders o
      WHERE o.id = ${newOrder.id}
    `;

    completeOrder.items = await sql`
      SELECT oi.*, i.name, i.description
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      WHERE oi.order_id = ${newOrder.id}
    `;

    order = completeOrder;
  });

  ctx.status = 201;
  ctx.body = { order };
});

/**
 * Update an order's status and/or survey response
 * PATCH /api/orders/:id
 */
router.patch('/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.status = 400;
    ctx.body = { error: { message: 'Invalid order ID' } };
    return;
  }

  const { status, survey_response } = ctx.request.body;

  // Build update fields
  const updates = [];
  const values = [];

  if (status !== undefined) {
    // Validate status
    if (!['pending', 'completed', 'canceled'].includes(status)) {
      ctx.status = 400;
      ctx.body = { error: { message: 'Invalid order status' } };
      return;
    }

    updates.push('status = $' + (values.length + 1) + '::order_status');
    values.push(status);
  }

  if (survey_response !== undefined) {
    // Validate survey_response is an object if provided
    if (survey_response !== null && (typeof survey_response !== 'object' || Array.isArray(survey_response))) {
      ctx.status = 400;
      ctx.body = { error: { message: 'survey_response must be a JSON object or null' } };
      return;
    }

    updates.push('survey_response = $' + (values.length + 1));
    values.push(survey_response);
  }

  if (updates.length === 0) {
    ctx.status = 400;
    ctx.body = { error: { message: 'No fields to update' } };
    return;
  }

  // Perform update
  const query = `
    UPDATE orders
    SET ${updates.join(', ')}
    WHERE id = $${values.length + 1}
    RETURNING *
  `;
  const [order] = await getSql().unsafe(query, [...values, id]);

  if (!order) {
    ctx.status = 404;
    ctx.body = { error: { message: 'Order not found' } };
    return;
  }

  // Get order items
  order.items = await getSql()`
    SELECT oi.*, i.name, i.description
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    WHERE oi.order_id = ${order.id}
  `;

  ctx.body = { order };
});

/**
 * Delete an order
 * DELETE /api/orders/:id
 */
router.delete('/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.status = 400;
    ctx.body = { error: { message: 'Invalid order ID' } };
    return;
  }

  // Use a transaction to ensure all operations succeed or fail together
  await getSql().begin(async (sql) => {
    // Delete order items first (due to foreign key constraint)
    await sql`
      DELETE FROM order_items
      WHERE order_id = ${id}
    `;

    // Delete order
    const [order] = await sql`
      DELETE FROM orders
      WHERE id = ${id}
      RETURNING *
    `;

    if (!order) {
      ctx.status = 404;
      ctx.body = { error: { message: 'Order not found' } };
      return;
    }
  });

  ctx.status = 200;
  ctx.body = { message: 'Order deleted successfully' };
});

export default router;
