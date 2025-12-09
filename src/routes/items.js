import Router from "koa-router";
import { getConnection } from "../lib/db.js";

const router = new Router();

const getSql = () => getConnection();

/**
 * Get all items
 * GET /api/items
 */
router.get("/", async (ctx) => {
  const items = await getSql()`
    SELECT * FROM items
    ORDER BY created_at DESC
  `;
  ctx.body = { items };
});

/**
 * Get available items
 * GET /api/items/available
 */
router.get("/available", async (ctx) => {
  const items = await getSql()`
    SELECT * FROM items
    WHERE available = true
    ORDER BY created_at DESC
  `;
  ctx.body = { items };
});

/**
 * Get items by kiosk type
 * GET /api/items/kiosk/:type
 */
router.get("/kiosk/:type", async (ctx) => {
  const kioskType = ctx.params.type;

  // Validate kiosk type
  if (!["sweet", "juice"].includes(kioskType)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk type" } };
    return;
  }

  const items = await getSql()`
    SELECT * FROM items
    WHERE kiosk_type = ${kioskType}::kiosk_type
    ORDER BY created_at DESC
  `;
  ctx.body = { items };
});

/**
 * Get a specific item by slug or ID (for backwards compatibility)
 * GET /api/items/:slug
 */
router.get("/:slug", async (ctx) => {
  const slugParam = ctx.params.slug;

  if (!slugParam) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid item slug or ID" } };
    return;
  }

  // Check if parameter is a number (for backwards compatibility with ID lookups)
  const id = parseInt(slugParam, 10);
  let item;

  if (!isNaN(id)) {
    // Look up by ID
    [item] = await getSql()`
      SELECT * FROM items
      WHERE id = ${id}
    `;
  } else {
    // Look up by slug
    [item] = await getSql()`
      SELECT * FROM items
      WHERE slug = ${slugParam}
    `;
  }

  if (!item) {
    ctx.status = 404;
    ctx.body = { error: { message: "Item not found" } };
    return;
  }

  ctx.body = { item };
});

/**
 * Create a new item
 * POST /api/items
 */
router.post("/", async (ctx) => {
  const { kiosk_type, item_type, name, slug, description, available } = ctx.request.body;

  // Validate required fields
  if (!kiosk_type || !item_type || !name || !slug) {
    ctx.status = 400;
    ctx.body = {
      error: { message: "kiosk_type, item_type, name, and slug are required" },
    };
    return;
  }

  // Validate kiosk type
  if (!["sweet", "juice"].includes(kiosk_type)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid kiosk type" } };
    return;
  }

  // Validate item type
  if (!["sweet", "juice", "gift"].includes(item_type)) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid item type" } };
    return;
  }

  // Check if slug already exists
  const existingItems = await getSql()`
    SELECT id FROM items WHERE slug = ${slug}
  `;

  if (existingItems.length > 0) {
    ctx.status = 400;
    ctx.body = { error: { message: "Item with this slug already exists" } };
    return;
  }

  const [item] = await getSql()`
    INSERT INTO items (
      slug, kiosk_type, item_type, name, description, available
    ) VALUES (
      ${slug}, ${kiosk_type}::kiosk_type, ${item_type}::item_type, ${name}, ${description}, ${available !== false}
    )
    RETURNING *
  `;

  ctx.status = 201;
  ctx.body = { item };
});

/**
 * Update an item by slug or ID (for backwards compatibility)
 * PATCH /api/items/:slug
 */
router.patch("/:slug", async (ctx) => {
  const slugParam = ctx.params.slug;

  if (!slugParam) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid item slug or ID" } };
    return;
  }

  const { name, slug: newSlug, description, available, item_type } = ctx.request.body;

  // Build update fields
  const updates = [];
  const values = [];

  if (name !== undefined) {
    updates.push('name = $' + (values.length + 1));
    values.push(name);
  }

  if (newSlug !== undefined) {
    // Check if parameter is a number
    const id = parseInt(slugParam, 10);

    if (!isNaN(id)) {
      // Check if new slug already exists on a different item (by ID)
      const existingItems = await getSql()`
        SELECT id FROM items WHERE slug = ${newSlug} AND id != ${id}
      `;
      if (existingItems.length > 0) {
        ctx.status = 400;
        ctx.body = { error: { message: "Item with this slug already exists" } };
        return;
      }
    } else {
      // Check if new slug already exists on a different item (by slug)
      const existingItems = await getSql()`
        SELECT id FROM items WHERE slug = ${newSlug} AND slug != ${slugParam}
      `;
      if (existingItems.length > 0) {
        ctx.status = 400;
        ctx.body = { error: { message: "Item with this slug already exists" } };
        return;
      }
    }

    updates.push('slug = $' + (values.length + 1));
    values.push(newSlug);
  }

  if (description !== undefined) {
    updates.push('description = $' + (values.length + 1));
    values.push(description);
  }

  if (available !== undefined) {
    updates.push('available = $' + (values.length + 1));
    values.push(available);
  }

  if (item_type !== undefined) {
    // Validate item type
    if (!["sweet", "juice", "gift"].includes(item_type)) {
      ctx.status = 400;
      ctx.body = { error: { message: "Invalid item type" } };
      return;
    }
    updates.push('item_type = $' + (values.length + 1) + '::item_type');
    values.push(item_type);
  }

  if (updates.length === 0) {
    ctx.status = 400;
    ctx.body = { error: { message: "No fields to update" } };
    return;
  }

  // Check if parameter is a number (for backwards compatibility with ID lookups)
  const id = parseInt(slugParam, 10);
  let query;

  if (!isNaN(id)) {
    // Update by ID
    query = `
      UPDATE items
      SET ${updates.join(', ')}
      WHERE id = $${values.length + 1}
      RETURNING *
    `;
    values.push(id);
  } else {
    // Update by slug
    query = `
      UPDATE items
      SET ${updates.join(', ')}
      WHERE slug = $${values.length + 1}
      RETURNING *
    `;
    values.push(slugParam);
  }

  const [item] = await getSql().unsafe(query, values);

  if (!item) {
    ctx.status = 404;
    ctx.body = { error: { message: "Item not found" } };
    return;
  }

  ctx.body = { item };
});

/**
 * Delete an item by slug or ID (for backwards compatibility)
 * DELETE /api/items/:slug
 */
router.delete("/:slug", async (ctx) => {
  const slugParam = ctx.params.slug;

  if (!slugParam) {
    ctx.status = 400;
    ctx.body = { error: { message: "Invalid item slug or ID" } };
    return;
  }

  // Check if parameter is a number (for backwards compatibility with ID lookups)
  const id = parseInt(slugParam, 10);
  let item;

  if (!isNaN(id)) {
    // Delete by ID
    [item] = await getSql()`
      DELETE FROM items
      WHERE id = ${id}
      RETURNING *
    `;
  } else {
    // Delete by slug
    [item] = await getSql()`
      DELETE FROM items
      WHERE slug = ${slugParam}
      RETURNING *
    `;
  }

  if (!item) {
    ctx.status = 404;
    ctx.body = { error: { message: "Item not found" } };
    return;
  }

  ctx.status = 200;
  ctx.body = { message: "Item deleted successfully" };
});

export default router;
