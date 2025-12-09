import Router from "koa-router";
import { getConnection } from "../lib/db.js";

const router = new Router();

const getSql = () => getConnection();

/**
 * Get all kiosks
 * GET /api/kiosks
 */
router.get("/", async (ctx) => {
  const kiosks = await getSql()`
    SELECT * FROM kiosks
    ORDER BY created_at DESC
  `;
  ctx.body = { kiosks };
});

/**
 * Get a specific kiosk
 * GET /api/kiosks/:id
 */
router.get("/:id", async (ctx) => {
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk ID" } };
    return;
  }

  // Get kiosk details
  const [kiosk] = await getSql()`
    SELECT * FROM kiosks
    WHERE id = ${id}
  `;

  if (!kiosk) {
    ctx.status = 404;
    ctx.body = { error: { message: "Kiosk not found" } };
    return;
  }

  // Get oldest pending order that has items matching this kiosk's type
  const [currentOrder] = await getSql()`
    WITH matching_orders AS (
      SELECT DISTINCT o.*
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN items i ON oi.item_id = i.id
      WHERE o.status = 'pending'
        AND i.kiosk_type = ${kiosk.type}::kiosk_type
        AND o.kiosk_id = ${kiosk.role === 'fulfill' ? kiosk.client_kiosk_id : kiosk.id}
    )
    SELECT o.*
    FROM matching_orders o
    ORDER BY o.created_at ASC
    LIMIT 1
  `;

  if (currentOrder) {
    // Get order items matching this kiosk's type
    currentOrder.items = await getSql()`
      SELECT oi.*, i.name, i.description
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      WHERE oi.order_id = ${currentOrder.id}
        AND i.kiosk_type = ${kiosk.type}::kiosk_type
    `;
  }

  ctx.body = { kiosk, currentOrder: currentOrder || null };
});

/**
 * Create a new kiosk
 * POST /api/kiosks
 */
router.post("/", async (ctx) => {
  const { type, role, enabled = true, nickname, app_version, app_platform, client_kiosk_id } = ctx.request.body;

  // Validate required fields
  if (!type || !role) {
    ctx.status = 400;
    ctx.body = { error: { message: "type and role are required" } };
    return;
  }

  // Validate kiosk type
  if (!["sweet", "juice"].includes(type)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk type" } };
    return;
  }

  // Validate kiosk role
  if (!["order", "fulfill", "customize"].includes(role)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk role" } };
    return;
  }

  // Validate client_kiosk_id based on role
  if (role === 'fulfill' && !client_kiosk_id) {
    ctx.status = 400;
    ctx.body = { error: { message: "client_kiosk_id is required when role is 'fulfill'" } };
    return;
  }
  if (role !== 'fulfill' && client_kiosk_id) {
    ctx.status = 400;
    ctx.body = { error: { message: "client_kiosk_id is not allowed when role is not 'fulfill'" } };
    return;
  }

  // Validate client_kiosk_id references a valid kiosk
  if (client_kiosk_id) {
    const [referencedKiosk] = await getSql()`
      SELECT id FROM kiosks WHERE id = ${client_kiosk_id}
    `;
    if (!referencedKiosk) {
      ctx.status = 400;
      ctx.body = { error: { message: "Referenced kiosk not found" } };
      return;
    }
  }

  // Build insert fields and values
  const fields = ['type', 'role', 'enabled'];
  const values = [type, role, enabled];
  const placeholders = ['$1::kiosk_type', '$2::kiosk_role', '$3'];

  if (nickname !== undefined) {
    fields.push('nickname');
    values.push(nickname);
    placeholders.push('$' + (values.length));
  }
  if (app_version !== undefined) {
    fields.push('app_version');
    values.push(app_version);
    placeholders.push('$' + (values.length));
  }
  if (app_platform !== undefined) {
    fields.push('app_platform');
    values.push(app_platform);
    placeholders.push('$' + (values.length));
  }
  if (client_kiosk_id !== undefined) {
    fields.push('client_kiosk_id');
    values.push(client_kiosk_id);
    placeholders.push('$' + (values.length));
  }

  const query = `
    INSERT INTO kiosks (${fields.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
  `;
  const [kiosk] = await getSql().unsafe(query, values);

  ctx.status = 201;
  ctx.body = { kiosk };
});

/**
 * Update a kiosk
 * PATCH /api/kiosks/:id
 */
router.patch("/:id", async (ctx) => {
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk ID" } };
    return;
  }

  const { enabled, nickname, type, role, app_version, app_platform, client_kiosk_id } = ctx.request.body;

  if (enabled === undefined && nickname === undefined &&
      type === undefined && role === undefined && app_version === undefined && app_platform === undefined &&
      client_kiosk_id === undefined) {
    ctx.status = 400;
    ctx.body = { error: { message: "No fields to update" } };
    return;
  }

  // Check if kiosk exists before doing any validation
  const [existingKiosk] = await getSql()`
    SELECT role, client_kiosk_id FROM kiosks WHERE id = ${id}
  `;

  if (!existingKiosk) {
    ctx.status = 404;
    ctx.body = { error: { message: "Kiosk not found" } };
    return;
  }

  // Validate kiosk type if provided
  if (type !== undefined && !["sweet", "juice"].includes(type)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk type" } };
    return;
  }

  if (role !== undefined && !["order", "fulfill", "customize"].includes(role)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk role" } };
    return;
  }

  // Build update fields dynamically
  const updates = [];
  const values = [];

  if (enabled !== undefined) {
    updates.push('enabled = $' + (values.length + 1));
    values.push(enabled);
  }
  if (nickname !== undefined) {
    updates.push('nickname = $' + (values.length + 1));
    values.push(nickname);
  }
  if (type !== undefined) {
    updates.push('type = $' + (values.length + 1) + '::kiosk_type');
    values.push(type);
  }
  if (role !== undefined) {
    updates.push('role = $' + (values.length + 1) + '::kiosk_role');
    values.push(role);
  }
  if (app_version !== undefined) {
    updates.push('app_version = $' + (values.length + 1));
    values.push(app_version);
  }
  if (app_platform !== undefined) {
    updates.push('app_platform = $' + (values.length + 1));
    values.push(app_platform);
  }
  if (client_kiosk_id !== undefined) {
    updates.push('client_kiosk_id = $' + (values.length + 1));
    values.push(client_kiosk_id);
  }

  // If role is being updated, validate client_kiosk_id
  if (role !== undefined) {
    if (role === 'fulfill' && client_kiosk_id === undefined && !existingKiosk.client_kiosk_id) {
      ctx.status = 400;
      ctx.body = { error: { message: "client_kiosk_id is required when role is 'fulfill'" } };
      return;
    }
    if (role !== 'fulfill' && (client_kiosk_id !== undefined || existingKiosk.client_kiosk_id)) {
      ctx.status = 400;
      ctx.body = { error: { message: "client_kiosk_id is not allowed when role is not 'fulfill'" } };
      return;
    }
  }

  // If client_kiosk_id is being updated, validate it references a valid kiosk
  if (client_kiosk_id !== undefined) {
    const [referencedKiosk] = await getSql()`
      SELECT id FROM kiosks WHERE id = ${client_kiosk_id}
    `;
    if (!referencedKiosk) {
      ctx.status = 400;
      ctx.body = { error: { message: "Referenced kiosk not found" } };
      return;
    }
  }

  if (updates.length === 0) {
    ctx.status = 400;
    ctx.body = { error: { message: "No fields to update" } };
    return;
  }

  const query = `
    UPDATE kiosks
    SET ${updates.join(', ')}
    WHERE id = $${values.length + 1}
    RETURNING *
  `;
  const [kiosk] = await getSql().unsafe(query, [...values, id]);

  ctx.body = { kiosk };
});

/**
 * Delete a kiosk
 * DELETE /api/kiosks/:id
 */
router.delete("/:id", async (ctx) => {
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk ID" } };
    return;
  }

  const [kiosk] = await getSql()`
    DELETE FROM kiosks
    WHERE id = ${id}
    RETURNING *
  `;

  if (!kiosk) {
    ctx.status = 404;
    ctx.body = { error: { message: "Kiosk not found" } };
    return;
  }

  ctx.status = 200;
  ctx.body = { message: "Kiosk deleted successfully" };
});

export default router;
